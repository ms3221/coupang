# 03. SQLite 스키마 / 마이그레이션

기존 Supabase(Postgres) 모델([../legacy-moon-project/04-data-model.md](../legacy-moon-project/04-data-model.md))을
SQLite로 옮긴다. 주요 변환 규칙:

| Postgres | SQLite |
|----------|--------|
| `uuid` | `TEXT` (Rust `uuid` v4 문자열 생성) |
| `jsonb` | `TEXT` (JSON 문자열, `serde_json`로 직렬화) |
| `timestamptz` | `TEXT` (ISO8601 문자열, 예: `2026-06-11T12:00:00Z`) |
| `integer` | `INTEGER` |
| `numeric/price` | `INTEGER` (원 단위 정수) |
| 자동 PK | `TEXT`(UUID) 또는 `INTEGER PRIMARY KEY` |

> SQLite는 동적 타입이지만 명시적으로 affinity를 둔다. boolean은 `INTEGER`(0/1).
> `admin_password`는 로그인 제거로 **사용하지 않음**.

## 마이그레이션 `0001_init.sql`

```sql
-- settings: 키-값 설정 (쿠팡 키 + 셀러 기본정보)
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

-- crawl_snapshots: 크롤링 스냅샷 헤더
CREATE TABLE IF NOT EXISTS crawl_snapshots (
  id            TEXT PRIMARY KEY,
  crawled_at    TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'hankyeong',
  product_count INTEGER NOT NULL DEFAULT 0
);

-- crawled_products: 스냅샷에 속한 상품
CREATE TABLE IF NOT EXISTS crawled_products (
  id             TEXT PRIMARY KEY,
  snapshot_id    TEXT NOT NULL REFERENCES crawl_snapshots(id) ON DELETE CASCADE,
  rank           INTEGER,
  code           TEXT,
  name           TEXT,
  original_price INTEGER,
  sale_price     INTEGER,
  discount_rate  TEXT,
  image          TEXT,
  detail_url     TEXT
);
CREATE INDEX IF NOT EXISTS idx_crawled_products_snapshot
  ON crawled_products(snapshot_id);

-- draft_registrations: 임시저장 (등록 폼 초안)
CREATE TABLE IF NOT EXISTS draft_registrations (
  id                 TEXT PRIMARY KEY,
  product_code       TEXT,
  product_name       TEXT NOT NULL DEFAULT '',
  form_data          TEXT NOT NULL DEFAULT '{}',   -- JSON
  status             TEXT NOT NULL DEFAULT 'draft', -- draft|registered|approved|failed
  coupang_product_id TEXT,
  coupang_status     TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON draft_registrations(status);

-- registered_products: 쿠팡 등록 완료 상품 (이력/원본)
CREATE TABLE IF NOT EXISTS registered_products (
  id                TEXT PRIMARY KEY,
  draft_id          TEXT REFERENCES draft_registrations(id) ON DELETE SET NULL,
  seller_product_id INTEGER,
  product_name      TEXT,
  sale_price        INTEGER,
  status            TEXT NOT NULL DEFAULT 'registered', -- registered|approved|rejected|deleted
  coupang_status    TEXT,
  request_data      TEXT,   -- JSON (재승인/수정 원본)
  response_data     TEXT,   -- JSON (쿠팡 응답 원본)
  registered_at     TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_registered_seller_id
  ON registered_products(seller_product_id);
```

> SQLite에서 FK CASCADE가 동작하려면 연결마다 `PRAGMA foreign_keys = ON;` 필요.

## settings 키 목록

로그인 관련(`admin_password`) 제외. 쿠팡 키 추가.

```
coupang_access_key            (신규: 기존 env COUPANG_ACCESS_KEY)
coupang_secret_key            (신규: 기존 env COUPANG_SECRET_KEY)
coupang_vendor_id
coupang_vendor_user_id
coupang_return_center_code
coupang_return_charge_name
coupang_company_contact_number
coupang_return_zip_code
coupang_return_address
coupang_return_address_detail
coupang_outbound_shipping_place_code
coupang_after_service_information
coupang_after_service_contact_number
```

## 마이그레이션 적용 (rusqlite 기준 의사 코드)

```rust
// db.rs
pub fn init_db(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    // user_version 으로 버전 관리
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version < 1 {
        conn.execute_batch(include_str!("../migrations/0001_init.sql"))?;
        conn.execute_batch("PRAGMA user_version = 1;")?;
    }
    Ok(conn)
}
```

> `tauri-plugin-sql`을 쓰면 플러그인의 `migrations` 배열로 동일 처리 가능.
> 첫 실행 시 자동 적용 → 빈 DB로 배포해도 스키마 자동 생성([../legacy-moon-project/07](../legacy-moon-project/07-tauri-migration-notes.md) "SQLite 동작 방식").

## 기존 정책 보존

- **하루 1스냅샷**: `save_snapshot` 시 같은 날짜(`crawled_at` 날짜부분) 스냅샷이 있으면 삭제 후 재생성.
  (Postgres의 날짜 범위 쿼리 → SQLite `date(crawled_at) = date(?)` 또는 문자열 prefix 비교)
- **두 status 체계 분리**: `draft_registrations.status` 와 `registered_products.status`는 별개(04 문서).
