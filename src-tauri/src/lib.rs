mod commands;
mod coupang;
mod crawler;
mod db;
mod error;
mod settings;

use std::sync::Mutex;

use serde::Serialize;
use tauri::Manager;

/// M0 검증용: 앱 데이터 디렉토리 / DB 경로를 반환 (invoke 왕복 + 경로 API 확인)
#[derive(Serialize)]
struct AppInfo {
    app_data_dir: String,
    db_path: String,
    platform: String,
}

#[tauri::command]
fn app_info(app: tauri::AppHandle) -> Result<AppInfo, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir 조회 실패: {e}"))?;
    let db_path = dir.join("data.db");
    Ok(AppInfo {
        app_data_dir: dir.to_string_lossy().to_string(),
        db_path: db_path.to_string_lossy().to_string(),
        platform: std::env::consts::OS.to_string(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init());

    // 자동 업데이트(데스크톱 전용)
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .setup(|app| {
            // app_data_dir/data.db 열기 + 마이그레이션 (첫 실행 시 자동 생성)
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::init(&dir.join("data.db"))?;
            app.manage(db::Db(Mutex::new(conn)));
            // 쿠팡/크롤링용 공유 HTTP 클라이언트
            app.manage(reqwest::Client::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            settings::get_settings,
            settings::get_setting,
            settings::save_settings,
            commands::coupang::coupang_health,
            commands::coupang::coupang_get_config,
            commands::coupang::coupang_predict_category,
            commands::coupang::coupang_get_meta,
            commands::coupang::coupang_lookup,
            commands::coupang::coupang_register_product,
            commands::coupang::coupang_approve_product,
            commands::coupang::coupang_update_product,
            commands::coupang::coupang_sync_product,
            commands::crawl::crawl_site,
            commands::crawled::list_crawled_products,
            commands::crawled::delete_crawled_product,
            commands::drafts::list_drafts,
            commands::drafts::get_draft,
            commands::drafts::upsert_draft,
            commands::drafts::delete_draft,
            commands::registered::list_registered_products,
            commands::registered::get_registered_product,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
