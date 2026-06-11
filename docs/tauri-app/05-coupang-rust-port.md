# 05. 쿠팡 WING 모듈 Rust 포팅

기존 `src/lib/coupang/*` (TS, "독립 모듈")을 Rust로 1:1 포팅.
원본 상세는 [../legacy-moon-project/03-coupang-api.md](../legacy-moon-project/03-coupang-api.md).

## Base URL
```
https://api-gateway.coupang.com
```

## 1. HMAC 서명 (`coupang/auth.rs`)

기존 `auth.ts`와 **바이트 단위로 동일한 메시지/포맷**이어야 한다.

```rust
use chrono::Utc;
use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// yyMMddTHHmmssZ (UTC)
fn format_datetime() -> String {
    Utc::now().format("%y%m%dT%H%M%SZ").to_string()
}

pub fn generate_signature(
    method: &str,
    path: &str,
    access_key: &str,
    secret_key: &str,
    datetime: Option<&str>,
) -> String {
    let dt = datetime.map(|s| s.to_string()).unwrap_or_else(format_datetime);

    // path 와 query 분리 (기존과 동일: '?' 기준 split)
    let (path_only, query) = match path.split_once('?') {
        Some((p, q)) => (p, q),
        None => (path, ""),
    };
    let message = format!("{dt}{method}{path_only}{query}");

    let mut mac = HmacSha256::new_from_slice(secret_key.as_bytes()).unwrap();
    mac.update(message.as_bytes());
    let signature = hex::encode(mac.finalize().into_bytes());

    format!(
        "CEA algorithm=HmacSHA256, access-key={access_key}, signed-date={dt}, signature={signature}"
    )
}
```

> ⚠️ **검증 필수**: 원본 `health/route.ts`에 고정 datetime(`260327T071000Z`)으로 만든 테스트 서명이
> 있다. 동일 입력으로 Rust 서명이 **글자까지 일치**하는지 단위 테스트로 확인할 것.

## 2. 클라이언트 (`coupang/client.rs`)

```rust
pub struct CoupangClient {
    access_key: String,
    secret_key: String,
    http: reqwest::Client,
}

impl CoupangClient {
    pub async fn request<T: DeserializeOwned>(
        &self, method: &str, path: &str, body: Option<serde_json::Value>,
    ) -> Result<T, AppError> {
        let auth = generate_signature(method, path, &self.access_key, &self.secret_key, None);
        let url = format!("https://api-gateway.coupang.com{path}");

        let req = self.http.request(method.parse().unwrap(), &url)
            .header("Content-Type", "application/json;charset=UTF-8")
            .header("Authorization", auth);
        let req = if let Some(b) = body { req.json(&b) } else { req };

        let res = req.send().await.map_err(|e| AppError::Coupang(e.to_string()))?;
        let status = res.status();
        let json: serde_json::Value = res.json().await.unwrap_or(serde_json::Value::Null);

        // 함정 1: HTTP status 비정상
        if !status.is_success() {
            let msg = json.get("message").and_then(|v| v.as_str()).unwrap_or("HTTP error");
            return Err(AppError::Coupang(format!("Coupang API error {status}: {msg}")));
        }
        // 함정 2: HTTP 200이어도 code == "ERROR"
        if json.get("code").and_then(|v| v.as_str()) == Some("ERROR") {
            let msg = json.get("message").and_then(|v| v.as_str()).unwrap_or("쿠팡 API 오류");
            return Err(AppError::Coupang(msg.to_string()));
        }
        serde_json::from_value(json).map_err(|e| AppError::Coupang(e.to_string()))
    }

    pub async fn health_check(&self) -> Result<HealthResult, AppError> {
        // 카테고리 메타(37544) GET 호출로 인증 확인
    }
}
```

## 3. 상품 API (`coupang/products.rs`)

| 함수 | Method | Path |
|------|--------|------|
| `create_product(data)` | POST | `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products` |
| `update_product(id, data)` | PUT | `.../seller-products` (body에 sellerProductId) |
| `update_product_partial(id, partial)` | PUT | `.../seller-products/{id}/partial` |
| `get_product(id)` | GET | `.../seller-products/{id}` |
| `approve_product(id)` | PUT | `.../seller-products/{id}/approvals` |
| `predict_category(name, brand)` | POST | `/v2/providers/openapi/apis/api/v1/categorization/predict` |

엔드포인트/메서드는 03 문서(legacy) 표와 동일하게 유지.

## 4. 타입 (`coupang/types.rs`)

기존 `types.ts`의 `CoupangProductRequest`, `CoupangProductItem`, `CoupangImage`,
`CoupangNotice`, `CoupangAttribute`, `CoupangResponse<T>`, `CoupangProductDetail` 등을
serde struct로 옮긴다. **필드명은 camelCase 유지**(쿠팡 API가 camelCase) →
`#[serde(rename_all = "camelCase")]`.

```rust
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CoupangProductItem {
    pub item_name: String,
    pub original_price: i64,
    pub sale_price: i64,
    pub maximum_buy_count: i64,
    // ... (06 문서의 전체 필드)
}
```

## 반드시 재현할 함정 (체크리스트)

- [ ] 서명 datetime은 **UTC `yyMMddTHHmmssZ`**, 서명·헤더 동일 값
- [ ] 서명 메시지 = `datetime + method + pathOnly + queryString` (query는 `?` 없이)
- [ ] **HTTP 200 + `code:"ERROR"`** 도 에러로 처리 (이중 에러 체크)
- [ ] 응답 `data`가 **숫자(sellerProductId)** 일 수 있음 → `Value`로 받아 분기
- [ ] 등록/수정 후 **5초 대기** 뒤 `get_product`로 최신 statusName
- [ ] 상태 매핑: 승인완료/부분승인완료→approved, 승인반려→rejected, 상품삭제→deleted, 그외→registered
- [ ] **contents 생성/수정 형식 차이** + 수정 시 `sellerProductItemId`/`vendorItemId` 주입
  - 생성: `{ contentType, content }`
  - 수정: `{ contentsType:"TEXT", contentDetails:[{ content, detailType:"TEXT" }] }`
- [ ] 승인 로직: approve 실패 메시지에 "임시저장" 포함 시 → 실제 statusName 조회 후 분기(재승인)

## 단위 테스트 권장

1. **서명 일치 테스트**: 고정 datetime으로 기존 TS 서명값과 Rust 서명값 비교.
2. **에러 분기 테스트**: `code:"ERROR"` 응답 mock → Err 반환 확인.
3. **data 숫자/객체 분기 테스트**: 두 형태 mock → sellerProductId 추출 확인.
