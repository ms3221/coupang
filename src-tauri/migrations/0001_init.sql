-- 0001_init: 초기 스키마
-- 기존 Supabase(Postgres) 모델을 SQLite로 이식. docs/tauri-app/03-sqlite-schema.md 참조.

-- settings: 키-값 설정 (쿠팡 키 + 셀러 기본정보). admin_password 없음(로그인 제거).
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
  form_data          TEXT NOT NULL DEFAULT '{}',
  status             TEXT NOT NULL DEFAULT 'draft',
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
  status            TEXT NOT NULL DEFAULT 'registered',
  coupang_status    TEXT,
  request_data      TEXT,
  response_data     TEXT,
  registered_at     TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_registered_seller_id
  ON registered_products(seller_product_id);
