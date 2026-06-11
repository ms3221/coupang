use std::collections::HashMap;

use rusqlite::params;
use tauri::State;

use crate::db::{now_iso, Db};

/// 전체 설정 조회 (key -> value)
#[tauri::command]
pub fn get_settings(db: State<Db>) -> Result<HashMap<String, String>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT key, value FROM settings")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut map = HashMap::new();
    for r in rows {
        let (k, v) = r.map_err(|e| e.to_string())?;
        map.insert(k, v);
    }
    Ok(map)
}

/// 단일 설정값 조회 (없으면 빈 문자열)
#[tauri::command]
pub fn get_setting(db: State<Db>, key: String) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let value: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| {
            r.get(0)
        })
        .ok();
    Ok(value.unwrap_or_default())
}

/// 여러 설정값 upsert
#[tauri::command]
pub fn save_settings(db: State<Db>, entries: HashMap<String, String>) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = now_iso();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            )
            .map_err(|e| e.to_string())?;
        for (k, v) in entries.iter() {
            stmt.execute(params![k, v, now]).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
