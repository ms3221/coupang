use rusqlite::{params, Row};
use serde::Serialize;
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

use crate::db::{now_iso, Db};
use crate::error::AppError;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub id: String,
    pub product_code: Option<String>,
    pub product_name: String,
    pub form_data: Value,
    pub status: String,
    pub coupang_product_id: Option<String>,
    pub coupang_status: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_draft(row: &Row) -> rusqlite::Result<Draft> {
    let form_data_str: String = row.get("form_data")?;
    let form_data: Value = serde_json::from_str(&form_data_str).unwrap_or_else(|_| Value::Object(Default::default()));
    Ok(Draft {
        id: row.get("id")?,
        product_code: row.get("product_code")?,
        product_name: row.get("product_name")?,
        form_data,
        status: row.get("status")?,
        coupang_product_id: row.get("coupang_product_id")?,
        coupang_status: row.get("coupang_status")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

const SELECT_COLS: &str = "id, product_code, product_name, form_data, status, coupang_product_id, coupang_status, created_at, updated_at";

/// 임시저장 목록 (product_code로 필터 가능, 최신순)
#[tauri::command]
pub fn list_drafts(db: State<Db>, product_code: Option<String>) -> Result<Vec<Draft>, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
    let sql = format!(
        "SELECT {SELECT_COLS} FROM draft_registrations {} ORDER BY updated_at DESC",
        if product_code.is_some() { "WHERE product_code = ?1" } else { "" }
    );
    let mut stmt = conn.prepare(&sql)?;
    let drafts = if let Some(code) = product_code {
        stmt.query_map(params![code], row_to_draft)?
            .collect::<Result<Vec<_>, _>>()?
    } else {
        stmt.query_map([], row_to_draft)?
            .collect::<Result<Vec<_>, _>>()?
    };
    Ok(drafts)
}

/// 단건 조회
#[tauri::command]
pub fn get_draft(db: State<Db>, id: String) -> Result<Draft, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
    let sql = format!("SELECT {SELECT_COLS} FROM draft_registrations WHERE id = ?1");
    let draft = conn.query_row(&sql, params![id], row_to_draft)?;
    Ok(draft)
}

/// 생성/수정 (id 있으면 업데이트, 없으면 생성)
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn upsert_draft(
    db: State<Db>,
    id: Option<String>,
    product_code: Option<String>,
    product_name: Option<String>,
    form_data: Option<Value>,
    status: Option<String>,
) -> Result<Draft, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
    let now = now_iso();
    let form_data_str = serde_json::to_string(&form_data.unwrap_or(Value::Object(Default::default())))
        .map_err(|e| AppError::Other(e.to_string()))?;
    let name = product_name.unwrap_or_default();
    let st = status.unwrap_or_else(|| "draft".into());

    let new_id = match id {
        Some(existing) => {
            conn.execute(
                "UPDATE draft_registrations
                 SET product_name = ?2, form_data = ?3, status = ?4, updated_at = ?5
                 WHERE id = ?1",
                params![existing, name, form_data_str, st, now],
            )?;
            existing
        }
        None => {
            let gen = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO draft_registrations
                 (id, product_code, product_name, form_data, status, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                params![gen, product_code, name, form_data_str, st, now],
            )?;
            gen
        }
    };

    let sql = format!("SELECT {SELECT_COLS} FROM draft_registrations WHERE id = ?1");
    let draft = conn.query_row(&sql, params![new_id], row_to_draft)?;
    Ok(draft)
}

/// 삭제
#[tauri::command]
pub fn delete_draft(db: State<Db>, id: String) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
    conn.execute("DELETE FROM draft_registrations WHERE id = ?1", params![id])?;
    Ok(())
}
