use rusqlite::{params, Row};
use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::db::Db;
use crate::error::AppError;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredProduct {
    pub id: String,
    pub draft_id: Option<String>,
    pub seller_product_id: Option<i64>,
    pub product_name: Option<String>,
    pub sale_price: Option<i64>,
    pub status: String,
    pub coupang_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_data: Option<Value>,
    pub registered_at: String,
    pub updated_at: String,
}

fn row_to_registered(row: &Row, include_request: bool) -> rusqlite::Result<RegisteredProduct> {
    let request_data = if include_request {
        row.get::<_, Option<String>>("request_data")?
            .and_then(|s| serde_json::from_str(&s).ok())
    } else {
        None
    };
    Ok(RegisteredProduct {
        id: row.get("id")?,
        draft_id: row.get("draft_id")?,
        seller_product_id: row.get("seller_product_id")?,
        product_name: row.get("product_name")?,
        sale_price: row.get("sale_price")?,
        status: row.get("status")?,
        coupang_status: row.get("coupang_status")?,
        request_data,
        registered_at: row.get("registered_at")?,
        updated_at: row.get("updated_at")?,
    })
}

/// 등록된 상품 목록 (최신순)
#[tauri::command]
pub fn list_registered_products(db: State<Db>) -> Result<Vec<RegisteredProduct>, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
    let mut stmt = conn.prepare(
        "SELECT id, draft_id, seller_product_id, product_name, sale_price, status,
                coupang_status, registered_at, updated_at
         FROM registered_products ORDER BY registered_at DESC",
    )?;
    let rows = stmt
        .query_map([], |r| row_to_registered(r, false))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// 단건 조회 (request_data 포함 — 편집 폼 복원용)
#[tauri::command]
pub fn get_registered_product(db: State<Db>, id: String) -> Result<RegisteredProduct, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
    let product = conn.query_row(
        "SELECT id, draft_id, seller_product_id, product_name, sale_price, status,
                coupang_status, request_data, registered_at, updated_at
         FROM registered_products WHERE id = ?1",
        params![id],
        |r| row_to_registered(r, true),
    )?;
    Ok(product)
}
