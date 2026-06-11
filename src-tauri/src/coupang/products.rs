// 쿠팡 상품/카테고리 API (CoupangClient 확장 메서드)
// 기존 lib/coupang/products.ts 포팅. 가변 응답이 많아 serde_json::Value로 다룬다.

use serde_json::{json, Value};

use super::client::CoupangClient;
use crate::error::AppError;

pub const PRODUCTS_PATH: &str =
    "/v2/providers/seller_api/apis/api/v1/marketplace/seller-products";
pub const CATEGORY_PREDICT_PATH: &str =
    "/v2/providers/openapi/apis/api/v1/categorization/predict";

/// 쿠팡 statusName → 내부 DB status
pub fn map_status(status_name: &str) -> &'static str {
    match status_name {
        "승인완료" | "부분승인완료" => "approved",
        "승인반려" => "rejected",
        "상품삭제" => "deleted",
        _ => "registered",
    }
}

/// 응답에서 sellerProductId 추출 (data가 숫자이거나 객체일 수 있음 — 함정 재현)
pub fn extract_seller_product_id(result: &Value) -> Option<i64> {
    match result.get("data") {
        Some(Value::Number(n)) => n.as_i64(),
        Some(obj) => obj.get("sellerProductId").and_then(|v| v.as_i64()),
        None => None,
    }
}

impl CoupangClient {
    /// 상품 생성
    pub async fn create_product(&self, data: Value) -> Result<Value, AppError> {
        self.request_value("POST", PRODUCTS_PATH, Some(data)).await
    }

    /// 상품 단건 조회 (statusName, items 포함)
    pub async fn get_product(&self, seller_product_id: i64) -> Result<Value, AppError> {
        let path = format!("{PRODUCTS_PATH}/{seller_product_id}");
        self.request_value("GET", &path, None).await
    }

    /// 상품 수정 (승인필요, body에 sellerProductId 포함)
    pub async fn update_product(
        &self,
        seller_product_id: i64,
        mut data: Value,
    ) -> Result<Value, AppError> {
        if let Value::Object(ref mut map) = data {
            map.insert("sellerProductId".into(), json!(seller_product_id));
        }
        self.request_value("PUT", PRODUCTS_PATH, Some(data)).await
    }

    /// 승인 요청
    pub async fn approve_product(&self, seller_product_id: i64) -> Result<Value, AppError> {
        let path = format!("{PRODUCTS_PATH}/{seller_product_id}/approvals");
        self.request_value("PUT", &path, None).await
    }

    /// 카테고리 추천(AI)
    pub async fn predict_category(
        &self,
        product_name: &str,
        brand: Option<&str>,
    ) -> Result<Value, AppError> {
        let mut body = json!({ "productName": product_name });
        if let Some(b) = brand {
            body["brand"] = json!(b);
        }
        self.request_value("POST", CATEGORY_PREDICT_PATH, Some(body))
            .await
    }

    /// 카테고리 메타정보(고시/옵션 등)
    pub async fn get_category_meta(&self, category_code: &str) -> Result<Value, AppError> {
        let path = format!(
            "/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-metas/display-category-codes/{category_code}"
        );
        self.request_value("GET", &path, None).await
    }

    /// 반품지 목록
    pub async fn get_return_centers(&self, vendor_id: &str) -> Result<Value, AppError> {
        let path = format!(
            "/v2/providers/openapi/apis/api/v4/vendors/{vendor_id}/returnShippingCenters"
        );
        self.request_value("GET", &path, None).await
    }

    /// 출고지 목록
    pub async fn get_outbound_places(&self) -> Result<Value, AppError> {
        let path =
            "/v2/providers/marketplace_openapi/apis/api/v2/vendor/shipping-place/outbound?pageNum=1&pageSize=50";
        self.request_value("GET", path, None).await
    }
}
