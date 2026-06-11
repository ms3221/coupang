use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

use crate::crawler::{self, HotProduct};
use crate::db::{now_iso, Db};
use crate::error::AppError;

/// 크롤 결과 1건 = 상품 + 이번 크롤에서의 상태(신규/가격변동/변화없음).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrawlItemResult {
    #[serde(flatten)]
    pub product: HotProduct,
    /// "new" | "updated"(가격변동) | "unchanged"
    pub status: String,
    /// 직전 저장된 판매가 (없으면 null)
    pub prev_sale_price: Option<i64>,
}

/// 지정 사이트의 BEST/HOT 6 크롤 → 상품 마스터에 즉시 upsert → 각 상품의 변동 상태 반환.
/// (미리보기/저장 단계 없음. UNIQUE(source, code)로 중복 자동 병합.)
#[tauri::command]
pub async fn crawl_site(
    http: State<'_, reqwest::Client>,
    db: State<'_, Db>,
    source: String,
) -> Result<Vec<CrawlItemResult>, AppError> {
    let spec = crawler::site_spec(&source)
        .ok_or_else(|| AppError::Crawl(format!("알 수 없는 사이트: {source}")))?;

    let products = crawler::crawl_best6(&http, spec.base_url).await?;
    let now = now_iso();

    let mut conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
    let tx = conn.transaction()?;

    let mut results = Vec::with_capacity(products.len());
    for p in products {
        // 직전 판매가 조회로 상태 판정 (행 없음 / 가격 NULL / 가격 있음)
        let prev: Option<Option<i64>> = tx
            .query_row(
                "SELECT sale_price FROM crawled_products WHERE source = ?1 AND code = ?2",
                params![spec.source, p.code],
                |r| r.get::<_, Option<i64>>(0),
            )
            .optional()?;

        let status = match &prev {
            None => "new",
            Some(prev_price) if *prev_price != p.sale_price => "updated",
            Some(_) => "unchanged",
        };
        let prev_sale_price = prev.flatten();

        // first_seen_at(?12)은 INSERT 시에만, last_seen_at도 같은 now.
        // 충돌 시 first_seen_at은 보존(UPDATE에서 제외).
        tx.execute(
            "INSERT INTO crawled_products
               (id, source, category, code, name, original_price, sale_price,
                discount_rate, image, detail_url, last_rank, first_seen_at, last_seen_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)
             ON CONFLICT(source, code) DO UPDATE SET
               name           = excluded.name,
               original_price = excluded.original_price,
               sale_price     = excluded.sale_price,
               discount_rate  = excluded.discount_rate,
               image          = excluded.image,
               detail_url     = excluded.detail_url,
               last_rank      = excluded.last_rank,
               last_seen_at   = excluded.last_seen_at",
            params![
                Uuid::new_v4().to_string(),
                spec.source,
                spec.category,
                p.code,
                p.name,
                p.original_price,
                p.sale_price,
                p.discount_rate,
                p.image,
                p.detail_url,
                p.rank,
                now,
            ],
        )?;

        results.push(CrawlItemResult {
            product: p,
            status: status.to_string(),
            prev_sale_price,
        });
    }

    tx.commit()?;
    Ok(results)
}
