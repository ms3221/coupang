use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;

/// Tauri 관리 상태로 보관하는 DB 연결 (단일 연결 + Mutex).
/// 로컬 단일 사용자 도구라 단일 연결로 충분.
pub struct Db(pub Mutex<Connection>);

/// DB 파일을 열고 마이그레이션을 적용한다.
/// - PRAGMA foreign_keys: FK CASCADE 동작에 필요
/// - user_version 으로 마이그레이션 버전 관리 (첫 실행 시 자동 생성)
pub fn init(db_path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version < 1 {
        conn.execute_batch(include_str!("../migrations/0001_init.sql"))?;
        conn.execute_batch("PRAGMA user_version = 1;")?;
    }
    if version < 2 {
        conn.execute_batch(include_str!("../migrations/0002_crawl_master.sql"))?;
        conn.execute_batch("PRAGMA user_version = 2;")?;
    }

    Ok(conn)
}

/// ISO8601(UTC) 현재 시각 문자열. updated_at 등에 사용.
pub fn now_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}
