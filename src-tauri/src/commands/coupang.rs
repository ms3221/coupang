use std::collections::HashMap;

use rusqlite::params;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::State;
use uuid::Uuid;

use crate::coupang::{extract_seller_product_id, map_status, CoupangClient, HealthResult};
use crate::db::{now_iso, Db};
use crate::error::AppError;

/// settings에서 쿠팡 키를 읽어 클라이언트를 구성한다. 키 미설정 시 Config 에러.
fn build_client(db: &Db, http: &reqwest::Client) -> Result<CoupangClient, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
    let access_key = read_setting(&conn, "coupang_access_key");
    let secret_key = read_setting(&conn, "coupang_secret_key");
    if access_key.is_empty() || secret_key.is_empty() {
        return Err(AppError::Config("쿠팡 API 키가 설정되지 않았습니다.".into()));
    }
    Ok(CoupangClient::new(access_key, secret_key, http.clone()))
}

fn read_setting(conn: &rusqlite::Connection, key: &str) -> String {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
        r.get::<_, String>(0)
    })
    .unwrap_or_default()
}

/// 쿠팡 API 키 유효성 확인.
#[tauri::command]
pub async fn coupang_health(
    db: State<'_, Db>,
    http: State<'_, reqwest::Client>,
) -> Result<HealthResult, AppError> {
    let client = build_client(&db, &http)?;
    Ok(client.health_check().await)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoupangConfig {
    pub has_keys: bool,
    pub has_vendor: bool,
    pub ready: bool,
    pub defaults: HashMap<String, String>,
}

/// 셀러 기본정보 + 준비상태 조회 (등록 폼 프리필용)
#[tauri::command]
pub fn coupang_get_config(db: State<Db>) -> Result<CoupangConfig, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
    let keys = [
        "coupang_vendor_id",
        "coupang_vendor_user_id",
        "coupang_return_center_code",
        "coupang_return_charge_name",
        "coupang_company_contact_number",
        "coupang_return_zip_code",
        "coupang_return_address",
        "coupang_return_address_detail",
        "coupang_outbound_shipping_place_code",
        "coupang_after_service_information",
        "coupang_after_service_contact_number",
    ];
    let mut defaults = HashMap::new();
    for k in keys {
        defaults.insert(k.to_string(), read_setting(&conn, k));
    }
    let has_keys = !read_setting(&conn, "coupang_access_key").is_empty()
        && !read_setting(&conn, "coupang_secret_key").is_empty();
    let has_vendor = !defaults["coupang_vendor_id"].is_empty()
        && !defaults["coupang_vendor_user_id"].is_empty();

    Ok(CoupangConfig {
        has_keys,
        has_vendor,
        ready: has_keys && has_vendor,
        defaults,
    })
}

/// 카테고리 추천(AI)
#[tauri::command]
pub async fn coupang_predict_category(
    db: State<'_, Db>,
    http: State<'_, reqwest::Client>,
    product_name: String,
    brand: Option<String>,
) -> Result<Value, AppError> {
    let client = build_client(&db, &http)?;
    client
        .predict_category(&product_name, brand.as_deref())
        .await
}

/// 카테고리 메타정보(고시/옵션)
#[tauri::command]
pub async fn coupang_get_meta(
    db: State<'_, Db>,
    http: State<'_, reqwest::Client>,
    category_code: String,
) -> Result<Value, AppError> {
    let client = build_client(&db, &http)?;
    client.get_category_meta(&category_code).await
}

/// 반품지/출고지 조회
#[tauri::command]
pub async fn coupang_lookup(
    db: State<'_, Db>,
    http: State<'_, reqwest::Client>,
) -> Result<Value, AppError> {
    let vendor_id = {
        let conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
        read_setting(&conn, "coupang_vendor_id")
    };
    if vendor_id.is_empty() {
        return Err(AppError::Config("vendorId가 설정되지 않았습니다.".into()));
    }
    let client = build_client(&db, &http)?;

    // 둘 다 시도하되 실패해도 다른 쪽은 반환 (기존 allSettled 동작)
    let return_centers = client.get_return_centers(&vendor_id).await;
    let shipping_places = client.get_outbound_places().await;

    Ok(json!({
        "returnCenters": return_centers.as_ref().ok(),
        "shippingPlaces": shipping_places.as_ref().ok(),
        "errors": {
            "returnCenters": return_centers.as_ref().err().map(|e| e.to_string()),
            "shippingPlaces": shipping_places.as_ref().err().map(|e| e.to_string()),
        }
    }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterResult {
    pub seller_product_id: Option<i64>,
    pub coupang_status: String,
    pub warning_message: Option<String>,
}

/// 상품 등록: 생성 → 5초 대기 → 최신 상태 조회 → registered_products 저장 → draft 갱신
#[tauri::command]
pub async fn coupang_register_product(
    db: State<'_, Db>,
    http: State<'_, reqwest::Client>,
    product: Value,
    draft_id: Option<String>,
) -> Result<RegisterResult, AppError> {
    // 중복 등록 방지
    if let Some(ref did) = draft_id {
        let conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
        let status: Option<String> = conn
            .query_row(
                "SELECT status FROM draft_registrations WHERE id = ?1",
                params![did],
                |r| r.get(0),
            )
            .ok();
        if status.as_deref() == Some("registered") {
            return Err(AppError::Coupang("이미 등록 완료된 상품입니다.".into()));
        }
    }

    let client = build_client(&db, &http)?;

    // 등록에 필요한 필드 미리 추출 (DB 저장용)
    let seller_name = product
        .get("sellerProductName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let sale_price = product
        .get("items")
        .and_then(|i| i.get(0))
        .and_then(|it| it.get("salePrice"))
        .and_then(|v| v.as_i64());

    let result = client.create_product(product.clone()).await?;
    let seller_product_id = extract_seller_product_id(&result);

    // 쿠팡 처리 시간 대기 후 최신 상태 조회
    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    let mut coupang_status = "임시저장".to_string();
    let mut latest_data = product.clone();
    if let Some(spid) = seller_product_id {
        if let Ok(detail) = client.get_product(spid).await {
            if let Some(s) = detail.get("data").and_then(|d| d.get("statusName")).and_then(|v| v.as_str()) {
                coupang_status = s.to_string();
            }
            if let Some(d) = detail.get("data") {
                latest_data = d.clone();
            }
        }
    }
    let db_status = map_status(&coupang_status);

    let warning_message = result
        .get("details")
        .or_else(|| result.get("message"))
        .and_then(|v| v.as_str())
        .filter(|_| {
            result
                .get("errorItems")
                .and_then(|e| e.as_array())
                .map(|a| !a.is_empty())
                .unwrap_or(false)
        })
        .map(|s| s.to_string());

    // registered_products 저장 + draft 갱신
    {
        let conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
        let now = now_iso();
        conn.execute(
            "INSERT INTO registered_products
             (id, draft_id, seller_product_id, product_name, sale_price, status, coupang_status,
              request_data, response_data, registered_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
            params![
                Uuid::new_v4().to_string(),
                draft_id,
                seller_product_id,
                seller_name,
                sale_price,
                db_status,
                coupang_status,
                serde_json::to_string(&latest_data).unwrap_or_default(),
                serde_json::to_string(&result).unwrap_or_default(),
                now,
            ],
        )?;

        if let Some(ref did) = draft_id {
            conn.execute(
                "UPDATE draft_registrations
                 SET status = 'registered', coupang_product_id = ?2, updated_at = ?3
                 WHERE id = ?1",
                params![did, seller_product_id.map(|n| n.to_string()), now],
            )?;
        }
    }

    Ok(RegisterResult {
        seller_product_id,
        coupang_status,
        warning_message,
    })
}

fn update_db_status(
    db: &Db,
    seller_product_id: i64,
    status: &str,
    coupang_status: &str,
    draft_id: Option<&str>,
) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
    let now = now_iso();
    if let Some(did) = draft_id {
        conn.execute(
            "UPDATE draft_registrations SET status = ?2, updated_at = ?3 WHERE id = ?1",
            params![did, status, now],
        )?;
    }
    conn.execute(
        "UPDATE registered_products
         SET status = ?2, coupang_status = ?3, updated_at = ?4
         WHERE seller_product_id = ?1",
        params![seller_product_id, status, coupang_status, now],
    )?;
    Ok(())
}

/// 재승인용 데이터 구성: contents 생성형식→수정형식 변환 + 기존 item ID 주입
fn build_reapprove_data(mut data: Value, existing_items: &[Value]) -> Value {
    if let Some(items) = data.get_mut("items").and_then(|v| v.as_array_mut()) {
        for (idx, item) in items.iter_mut().enumerate() {
            // contents 변환
            if let Some(contents) = item.get("contents").and_then(|v| v.as_array()).cloned() {
                let converted: Vec<Value> = contents
                    .into_iter()
                    .map(|c| {
                        if c.get("contentsType").is_some() {
                            c
                        } else {
                            let ctype = c.get("contentType").and_then(|v| v.as_str()).unwrap_or("TEXT");
                            let content = c.get("content").and_then(|v| v.as_str()).unwrap_or("");
                            json!({
                                "contentsType": ctype,
                                "contentDetails": [{ "content": content, "detailType": ctype }]
                            })
                        }
                    })
                    .collect();
                item["contents"] = json!(converted);
            }
            // 기존 item ID 주입 (수정 시 필수)
            if let Some(ex) = existing_items.get(idx) {
                if let Some(v) = ex.get("sellerProductItemId") {
                    item["sellerProductItemId"] = v.clone();
                }
                if let Some(v) = ex.get("vendorItemId") {
                    item["vendorItemId"] = v.clone();
                }
            }
        }
    }
    data
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveResult {
    pub message: String,
    pub reapproved: bool,
    pub already_approved: bool,
    pub status_name: Option<String>,
}

/// 승인 요청 (승인반려 시 수정 후 재승인까지 자동 처리)
#[tauri::command]
pub async fn coupang_approve_product(
    db: State<'_, Db>,
    http: State<'_, reqwest::Client>,
    seller_product_id: i64,
    draft_id: Option<String>,
) -> Result<ApproveResult, AppError> {
    let client = build_client(&db, &http)?;

    // 1. 승인 시도
    let approve_err = match client.approve_product(seller_product_id).await {
        Ok(_) => {
            update_db_status(&db, seller_product_id, "approved", "승인완료", draft_id.as_deref())?;
            return Ok(ApproveResult {
                message: "승인 요청이 완료되었습니다.".into(),
                reapproved: false,
                already_approved: false,
                status_name: Some("승인완료".into()),
            });
        }
        Err(e) => e,
    };

    // "임시저장 상태만 승인 가능" 이외의 에러는 그대로 반환
    if !approve_err.to_string().contains("임시저장") {
        return Err(approve_err);
    }

    // 2. 실제 상태 확인
    let detail = client.get_product(seller_product_id).await?;
    let status_name = detail
        .get("data")
        .and_then(|d| d.get("statusName"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if status_name == "승인완료" || status_name == "부분승인완료" {
        update_db_status(&db, seller_product_id, "approved", &status_name, draft_id.as_deref())?;
        return Ok(ApproveResult {
            message: "이미 승인 처리된 상품입니다.".into(),
            reapproved: false,
            already_approved: true,
            status_name: Some(status_name),
        });
    }

    if status_name == "승인반려" {
        // 원본 등록 데이터 로드
        let request_data: Value = {
            let conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
            let s: Option<String> = conn
                .query_row(
                    "SELECT request_data FROM registered_products WHERE seller_product_id = ?1",
                    params![seller_product_id],
                    |r| r.get(0),
                )
                .ok()
                .flatten();
            match s.and_then(|x| serde_json::from_str(&x).ok()) {
                Some(v) => v,
                None => {
                    return Err(AppError::Coupang(
                        "원본 등록 데이터를 찾을 수 없어 수정 후 재승인이 불가합니다.".into(),
                    ))
                }
            }
        };

        let existing_items = detail
            .get("data")
            .and_then(|d| d.get("items"))
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let final_data = build_reapprove_data(request_data, &existing_items);
        client.update_product(seller_product_id, final_data).await?;
        client.approve_product(seller_product_id).await?;

        update_db_status(&db, seller_product_id, "registered", "심사중", draft_id.as_deref())?;
        return Ok(ApproveResult {
            message: "승인반려 상품을 수정 후 재승인 요청했습니다.".into(),
            reapproved: true,
            already_approved: false,
            status_name: Some("심사중".into()),
        });
    }

    Err(AppError::Coupang(format!(
        "현재 쿠팡 상태가 \"{status_name}\"이라 승인 요청할 수 없습니다."
    )))
}

/// 수정용 items 구성: contents 수정형식 변환(TEXT 강제) + 기존 item ID 주입
fn prepare_update_items(product: &Value, existing_items: &[Value]) -> Value {
    let mut data = product.clone();
    if let Some(items) = data.get_mut("items").and_then(|v| v.as_array_mut()) {
        for (idx, item) in items.iter_mut().enumerate() {
            if let Some(contents) = item.get("contents").and_then(|v| v.as_array()).cloned() {
                let converted: Vec<Value> = contents
                    .into_iter()
                    .map(|c| {
                        if c.get("contentsType").is_some() {
                            // 이미 수정형식 → detailType TEXT 강제
                            let details = c
                                .get("contentDetails")
                                .and_then(|v| v.as_array())
                                .cloned()
                                .unwrap_or_default();
                            let nd: Vec<Value> = details
                                .into_iter()
                                .map(|mut d| {
                                    if let Value::Object(ref mut m) = d {
                                        m.insert("detailType".into(), json!("TEXT"));
                                    }
                                    d
                                })
                                .collect();
                            json!({ "contentsType": "TEXT", "contentDetails": nd })
                        } else {
                            // 생성형식 → 수정형식
                            let content = c.get("content").and_then(|v| v.as_str()).unwrap_or("");
                            json!({
                                "contentsType": "TEXT",
                                "contentDetails": [{ "content": content, "detailType": "TEXT" }]
                            })
                        }
                    })
                    .collect();
                item["contents"] = json!(converted);
            }
            if let Some(ex) = existing_items.get(idx) {
                if let Some(v) = ex.get("sellerProductItemId") {
                    item["sellerProductItemId"] = v.clone();
                }
                if let Some(v) = ex.get("vendorItemId") {
                    item["vendorItemId"] = v.clone();
                }
            }
        }
    }
    data
}

/// 상품 수정: 기존 item ID 주입 → 수정 → 5초 대기 → 최신 상태 조회 → DB 갱신
#[tauri::command]
pub async fn coupang_update_product(
    db: State<'_, Db>,
    http: State<'_, reqwest::Client>,
    registered_id: String,
    product: Value,
) -> Result<RegisterResult, AppError> {
    // seller_product_id 조회
    let seller_product_id: i64 = {
        let conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
        conn.query_row(
            "SELECT seller_product_id FROM registered_products WHERE id = ?1",
            params![registered_id],
            |r| r.get(0),
        )
        .map_err(|_| AppError::Coupang("등록된 상품을 찾을 수 없습니다.".into()))?
    };

    let client = build_client(&db, &http)?;

    // 기존 상품 조회 → item ID 확보
    let existing = client.get_product(seller_product_id).await?;
    let existing_items = existing
        .get("data")
        .and_then(|d| d.get("items"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let final_data = prepare_update_items(&product, &existing_items);
    let result = client.update_product(seller_product_id, final_data).await?;

    // DB 저장용 필드
    let seller_name = product
        .get("sellerProductName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let sale_price = product
        .get("items")
        .and_then(|i| i.get(0))
        .and_then(|it| it.get("salePrice"))
        .and_then(|v| v.as_i64());

    // 5초 대기 후 최신 상태
    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    let mut coupang_status = "임시저장".to_string();
    let mut latest = product.clone();
    if let Ok(detail) = client.get_product(seller_product_id).await {
        if let Some(s) = detail.get("data").and_then(|d| d.get("statusName")).and_then(|v| v.as_str()) {
            coupang_status = s.to_string();
        }
        if let Some(d) = detail.get("data") {
            latest = d.clone();
        }
    }
    let db_status = map_status(&coupang_status);

    {
        let conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
        conn.execute(
            "UPDATE registered_products
             SET request_data = ?2, product_name = ?3, sale_price = ?4,
                 coupang_status = ?5, status = ?6, updated_at = ?7
             WHERE id = ?1",
            params![
                registered_id,
                serde_json::to_string(&latest).unwrap_or_default(),
                seller_name,
                sale_price,
                coupang_status,
                db_status,
                now_iso(),
            ],
        )?;
    }

    let warning_message = result
        .get("message")
        .and_then(|v| v.as_str())
        .filter(|_| {
            result
                .get("errorItems")
                .and_then(|e| e.as_array())
                .map(|a| !a.is_empty())
                .unwrap_or(false)
        })
        .map(|s| s.to_string());

    Ok(RegisterResult {
        seller_product_id: Some(seller_product_id),
        coupang_status,
        warning_message,
    })
}

/// 단건 조회 + DB 동기화 (대시보드 상태 동기화)
#[tauri::command]
pub async fn coupang_sync_product(
    db: State<'_, Db>,
    http: State<'_, reqwest::Client>,
    seller_product_id: i64,
    registered_id: String,
) -> Result<Value, AppError> {
    let client = build_client(&db, &http)?;
    let detail = client.get_product(seller_product_id).await?;
    let data = detail.get("data").cloned().unwrap_or(Value::Null);
    let status_name = data
        .get("statusName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let db_status = map_status(&status_name);

    {
        let conn = db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
        conn.execute(
            "UPDATE registered_products
             SET status = ?2, coupang_status = ?3, request_data = ?4, updated_at = ?5
             WHERE id = ?1",
            params![
                registered_id,
                db_status,
                status_name,
                serde_json::to_string(&data).unwrap_or_default(),
                now_iso(),
            ],
        )?;
    }

    Ok(data)
}
