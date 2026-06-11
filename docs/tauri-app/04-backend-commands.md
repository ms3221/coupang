# 04. 백엔드 커맨드 API

기존 Next.js API 라우트([../legacy-moon-project/02-admin-architecture.md](../legacy-moon-project/02-admin-architecture.md))를
Rust `#[tauri::command]` 로 1:1 대응. 프론트는 `invoke("name", args)` 로 호출.

> 명명: snake_case (Rust 관례, `invoke`에서도 동일 키 사용). 인자는 serde로 역직렬화.
> 모든 커맨드는 `Result<T, AppError>` 반환 → 프론트에서 `try/catch`.

## 커맨드 ↔ 기존 라우트 매핑

| 커맨드 | 기존 라우트 | 동작 |
|--------|------------|------|
| `crawl_hot6` | `POST /crawl` | 한경 HOT 6 크롤링 (DB 미저장 스냅샷 반환) |
| `crawl_product_detail(url)` | `POST /crawl {type:detail}` | 개별 상세 크롤링 |
| `list_snapshots` | `GET /products` | 저장된 스냅샷+상품 목록 |
| `save_snapshot(snapshot)` | `POST /products` | 스냅샷 저장 (하루 1개 정책) |
| `delete_snapshot(id)` | `DELETE /products` | 스냅샷 삭제(CASCADE) |
| `list_drafts(product_code?)` | `GET /drafts` | 임시저장 목록 |
| `get_draft(id)` | `GET /drafts?id=` | 단건 |
| `upsert_draft(input)` | `POST /drafts` | 생성/수정 |
| `delete_draft(id)` | `DELETE /drafts` | 삭제 |
| `list_registered_products` | `GET /coupang/products` | 등록상품 목록 |
| `get_registered_product(id)` | `GET /coupang/products?id=` | 단건(+request_data) |
| `coupang_health` | `GET /coupang/health` | API 키 유효성 |
| `coupang_get_config` | `GET /coupang/config` | 셀러 기본정보+준비상태 |
| `coupang_save_config(input)` | `PUT /coupang/config` | 셀러 기본정보 저장 |
| `coupang_predict_category(name, brand?)` | `POST /coupang/category` | 카테고리 AI 추천 |
| `coupang_get_meta(category_code)` | `GET /coupang/meta` | 카테고리 메타(고시/옵션) |
| `coupang_lookup` | `GET /coupang/lookup` | 반품지/출고지 조회 |
| `coupang_register_product(product, draft_id?)` | `POST /coupang/register` | 상품 등록 |
| `coupang_update_product(registered_id, product)` | `POST /coupang/update` | 상품 수정 |
| `coupang_approve_product(seller_product_id, draft_id?)` | `PUT /coupang/approve` | 승인/재승인 |
| `coupang_sync_product(seller_product_id, registered_id)` | `GET /coupang/product` | 단건 조회+DB동기화 |
| `get_settings` / `save_settings(map)` | `GET/PUT /settings` | 전체 설정 |

> **제거**: `auth` 라우트(로그인) 및 미들웨어 → 로컬 앱이라 불필요.

## 시그니처 예시 (Rust)

```rust
// commands/coupang.rs

#[tauri::command]
pub async fn coupang_health(state: State<'_, AppState>) -> Result<HealthResult, AppError> {
    let client = build_client(&state).await?;   // settings에서 키 로드
    client.health_check().await
}

#[tauri::command]
pub async fn coupang_register_product(
    state: State<'_, AppState>,
    product: CoupangProductRequest,
    draft_id: Option<String>,
) -> Result<RegisterResult, AppError> {
    // 1. draft 중복 체크
    // 2. createProduct
    // 3. sellerProductId 추출 (숫자/객체 분기)
    // 4. 5초 대기 → getProduct
    // 5. registered_products INSERT
    // 6. draft status=registered UPDATE
}

#[tauri::command]
pub async fn coupang_approve_product(
    state: State<'_, AppState>,
    seller_product_id: i64,
    draft_id: Option<String>,
) -> Result<ApproveResult, AppError> {
    // approve 시도 → 실패 시 statusName 분기 → 승인반려면 update+재승인
}
```

## 프론트 호출 래퍼 예시 (`src/lib/api.ts`)

```ts
import { invoke } from "@tauri-apps/api/core";

export const api = {
  crawlHot6: () => invoke<CrawlSnapshot>("crawl_hot6"),
  saveSnapshot: (snapshot: CrawlSnapshot) =>
    invoke<{ id: string }>("save_snapshot", { snapshot }),
  registerProduct: (product: CoupangProductRequest, draftId?: string) =>
    invoke<RegisterResult>("coupang_register_product", { product, draftId }),
  approveProduct: (sellerProductId: number, draftId?: string) =>
    invoke<ApproveResult>("coupang_approve_product", { sellerProductId, draftId }),
  // ...
};
```

## 공통 에러 처리

```rust
// error.rs
#[derive(thiserror::Error, Debug)]
pub enum AppError {
    #[error("쿠팡 API 오류: {0}")] Coupang(String),
    #[error("DB 오류: {0}")] Db(String),
    #[error("설정 누락: {0}")] Config(String),
    #[error("크롤링 실패: {0}")] Crawl(String),
    #[error(transparent)] Other(#[from] anyhow::Error),
}
// serde::Serialize 구현 → invoke 에러로 프론트 전달
```

## AppState (공유 상태)

```rust
pub struct AppState {
    pub db: Mutex<Connection>,   // 또는 r2d2 풀
    pub http: reqwest::Client,   // 재사용
}
```

> 키는 매 요청 시 `settings`에서 읽어 `CoupangClient`를 구성(기존 getClient 패턴과 동일).
> 키 미설정 시 `AppError::Config` 반환 → 프론트는 설정 화면 유도.
