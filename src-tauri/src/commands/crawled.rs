use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::db::Db;
use crate::error::AppError;

/// 수집 상품 마스터 1행.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrawledProduct {
    pub id: String,
    pub source: String,
    pub category: String,
    pub code: String,
    pub name: String,
    pub original_price: Option<i64>,
    pub sale_price: Option<i64>,
    pub discount_rate: Option<String>,
    pub image: Option<String>,
    pub detail_url: Option<String>,
    pub last_rank: Option<i64>,
    pub first_seen_at: String,
    pub last_seen_at: String,
}

/// 수집 상품 목록 (source/category 필터, 옵션). 순위순.
#[tauri::command]
pub fn list_crawled_products(
    db: State<Db>,
    source: Option<String>,
    category: Option<String>,
) -> Result<Vec<CrawledProduct>, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
    let mut stmt = conn.prepare(
        "SELECT id, source, category, code, name, original_price, sale_price,
                discount_rate, image, detail_url, last_rank, first_seen_at, last_seen_at
         FROM crawled_products
         WHERE (?1 IS NULL OR source = ?1)
           AND (?2 IS NULL OR category = ?2)
         ORDER BY source, category,
                  CASE WHEN last_rank IS NULL THEN 1 ELSE 0 END, last_rank ASC,
                  last_seen_at DESC",
    )?;
    let rows = stmt.query_map(params![source, category], |r| {
        Ok(CrawledProduct {
            id: r.get(0)?,
            source: r.get(1)?,
            category: r.get(2)?,
            code: r.get(3)?,
            name: r.get(4)?,
            original_price: r.get(5)?,
            sale_price: r.get(6)?,
            discount_rate: r.get(7)?,
            image: r.get(8)?,
            detail_url: r.get(9)?,
            last_rank: r.get(10)?,
            first_seen_at: r.get(11)?,
            last_seen_at: r.get(12)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// 수집 상품 1건 삭제.
#[tauri::command]
pub fn delete_crawled_product(db: State<Db>, id: String) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
    conn.execute("DELETE FROM crawled_products WHERE id = ?1", params![id])?;
    Ok(())
}
