// 쿠팡 WING API HMAC-SHA256 인증
// 기존 lib/coupang/auth.ts 와 동일한 메시지/포맷이어야 한다.

use chrono::Utc;
use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// yyMMddTHHmmssZ (UTC)
pub fn format_datetime() -> String {
    Utc::now().format("%y%m%dT%H%M%SZ").to_string()
}

/// Authorization 헤더 문자열을 생성한다.
/// message = datetime + method + pathOnly + queryString  (query는 '?' 없이)
pub fn generate_signature(
    method: &str,
    path: &str,
    access_key: &str,
    secret_key: &str,
    datetime: Option<&str>,
) -> String {
    let dt = datetime
        .map(|s| s.to_string())
        .unwrap_or_else(format_datetime);

    let (path_only, query) = match path.split_once('?') {
        Some((p, q)) => (p, q),
        None => (path, ""),
    };
    let message = format!("{dt}{method}{path_only}{query}");

    let mut mac = HmacSha256::new_from_slice(secret_key.as_bytes())
        .expect("HMAC accepts key of any size");
    mac.update(message.as_bytes());
    let signature = hex::encode(mac.finalize().into_bytes());

    format!(
        "CEA algorithm=HmacSHA256, access-key={access_key}, signed-date={dt}, signature={signature}"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    // 기준값은 독립 구현(Python hmac)으로 계산. 기존 TS 알고리즘과 1바이트 일치 검증.
    #[test]
    fn signature_matches_reference() {
        let sig = generate_signature(
            "GET",
            "/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-metas/display-category-codes/37544",
            "test-access-key",
            "test-secret-key",
            Some("260327T071000Z"),
        );
        assert_eq!(
            sig,
            "CEA algorithm=HmacSHA256, access-key=test-access-key, signed-date=260327T071000Z, signature=fc06546ec1c834c3f328ae8099f563f15c260f9bd31a6d43efdaa1974330b9ec"
        );
    }

    // path에 query가 있는 경우: '?' 제거 후 이어붙여 서명
    #[test]
    fn signature_with_query() {
        let sig = generate_signature(
            "GET",
            "/v2/test?pageNum=1&pageSize=50",
            "k",
            "test-secret-key",
            Some("260327T071000Z"),
        );
        assert!(sig.ends_with(
            "signature=777b8fdb7b3d80bebd1ed7463f68e91fb447c75ef3e066aec3e808bf99b35b06"
        ));
    }

    #[test]
    fn datetime_format_len() {
        // yyMMddTHHmmssZ = 14 chars (예: 260327T071000Z)
        assert_eq!(format_datetime().len(), 14);
    }
}
