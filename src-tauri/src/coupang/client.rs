// 쿠팡 WING API HTTP 클라이언트
// 기존 lib/coupang/client.ts 포팅. 두 가지 함정 재현:
//  1) HTTP status 비정상 → 에러
//  2) HTTP 200이어도 body의 code == "ERROR" → 에러

use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;

use super::auth::generate_signature;
use crate::error::AppError;

const BASE_URL: &str = "https://api-gateway.coupang.com";

#[derive(Clone)]
pub struct CoupangClient {
    access_key: String,
    secret_key: String,
    http: reqwest::Client,
}

#[derive(Serialize)]
pub struct HealthResult {
    pub ok: bool,
    pub message: String,
}

impl CoupangClient {
    pub fn new(access_key: String, secret_key: String, http: reqwest::Client) -> Self {
        Self {
            access_key,
            secret_key,
            http,
        }
    }

    /// 원시 JSON 응답을 반환 (data가 숫자/객체 등 형태가 가변일 때 호출부에서 분기).
    pub async fn request_value(
        &self,
        method: &str,
        path: &str,
        body: Option<Value>,
    ) -> Result<Value, AppError> {
        let auth = generate_signature(method, path, &self.access_key, &self.secret_key, None);
        let url = format!("{BASE_URL}{path}");
        let m = reqwest::Method::from_bytes(method.as_bytes())
            .map_err(|e| AppError::Coupang(format!("잘못된 method: {e}")))?;

        let mut req = self
            .http
            .request(m, &url)
            .header("Content-Type", "application/json;charset=UTF-8")
            .header("Authorization", auth);
        if let Some(b) = body {
            req = req.json(&b);
        }

        let res = req.send().await.map_err(|e| AppError::Coupang(e.to_string()))?;
        let status = res.status();
        let json: Value = res.json().await.unwrap_or(Value::Null);

        // 함정 1: HTTP status 비정상
        if !status.is_success() {
            let msg = json
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("HTTP error");
            return Err(AppError::Coupang(format!(
                "Coupang API error {}: {}",
                status.as_u16(),
                msg
            )));
        }
        // 함정 2: HTTP 200 + code == "ERROR"
        if json.get("code").and_then(|v| v.as_str()) == Some("ERROR") {
            let msg = json
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("쿠팡 API 오류");
            return Err(AppError::Coupang(msg.to_string()));
        }

        Ok(json)
    }

    /// 타입 지정 응답.
    pub async fn request<T: DeserializeOwned>(
        &self,
        method: &str,
        path: &str,
        body: Option<Value>,
    ) -> Result<T, AppError> {
        let json = self.request_value(method, path, body).await?;
        serde_json::from_value(json).map_err(|e| AppError::Coupang(e.to_string()))
    }

    /// API 키 유효성 확인 (카테고리 메타 37544 조회).
    pub async fn health_check(&self) -> HealthResult {
        let path = "/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-metas/display-category-codes/37544";
        match self.request_value("GET", path, None).await {
            Ok(_) => HealthResult {
                ok: true,
                message: "인증 성공".into(),
            },
            Err(e) => HealthResult {
                ok: false,
                message: format!("인증 실패: {e}"),
            },
        }
    }
}
