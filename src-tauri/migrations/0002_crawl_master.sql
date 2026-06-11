-- 0002: 크롤 스냅샷 모델 폐기 → 상품 마스터 테이블
-- 기존 스냅샷(crawl_snapshots/crawled_products)은 버리기로 합의(2026-06-11).
-- docs 및 memory(crawl-data-model-redesign) 참조.

DROP TABLE IF EXISTS crawled_products;
DROP TABLE IF EXISTS crawl_snapshots;

-- crawled_products: 수집 상품 마스터 (스냅샷 복제 X, source+code 단위 upsert)
CREATE TABLE crawled_products (
  id             TEXT PRIMARY KEY,
  source         TEXT NOT NULL DEFAULT 'hankyeong',  -- 사이트 구분
  category       TEXT NOT NULL DEFAULT '',           -- 사이트별 카테고리 (예: hot6)
  code           TEXT NOT NULL,                       -- 사이트 상품코드 (한경 data-mgcode)
  name           TEXT NOT NULL DEFAULT '',
  original_price INTEGER,
  sale_price     INTEGER,
  discount_rate  TEXT,
  image          TEXT,
  detail_url     TEXT,
  last_rank      INTEGER,                             -- 마지막 크롤 시 순위
  first_seen_at  TEXT NOT NULL,                       -- 처음 수집된 시각 (보존)
  last_seen_at   TEXT NOT NULL,                       -- 마지막으로 보인 시각 (갱신)
  UNIQUE(source, code)
);
CREATE INDEX IF NOT EXISTS idx_crawled_source_cat
  ON crawled_products(source, category);
