# 06. 크롤러 Rust 포팅

기존 `src/lib/crawler.ts`(cheerio)를 Rust `scraper` 로 포팅.
원본 셀렉터/플로우는 [../legacy-moon-project/05-flows.md](../legacy-moon-project/05-flows.md) "크롤링 플로우".

## 대상
```
BASE_URL = https://www.hankyeong.kr
```
- User-Agent를 브라우저로 위장(기존과 동일):
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ... Chrome/120 ... Safari/537.36`

## HOT 6 크롤링 (`crawl_hot6`)

### 셀렉터 맵 (그대로 유지)
| 데이터 | 셀렉터 |
|--------|--------|
| 상품 아이템 | `.brd-recommen .panel.prod` |
| 상품코드 | `.itemprod` 의 `data-mgcode` 속성 |
| 상세 URL | `{BASE_URL}/Goods/Detail/{code}` |
| 순위 | `.dc-rank` (텍스트 정수) |
| 이미지 | `img.img-responsive` 의 `src` |
| 상품명 | `.prod-title` |
| 원가 | `.org-price` |
| 판매가 | `.price:not(.org-price)` 첫번째 |
| 할인율 | `.dc-rate` |

### Rust 의사 코드 (scraper)
```rust
use scraper::{Html, Selector};

pub async fn crawl_hot6(http: &reqwest::Client) -> Result<CrawlSnapshot, AppError> {
    let html = http.get("https://www.hankyeong.kr")
        .header("User-Agent", UA)
        .send().await?.text().await?;
    let doc = Html::parse_document(&html);

    let item_sel = Selector::parse(".brd-recommen .panel.prod").unwrap();
    let mut products = Vec::new();
    for (i, el) in doc.select(&item_sel).enumerate() {
        let code = el.select(&Selector::parse(".itemprod").unwrap())
            .next().and_then(|e| e.value().attr("data-mgcode"))
            .unwrap_or("").to_string();
        let detail_url = if code.is_empty() { String::new() }
            else { format!("https://www.hankyeong.kr/Goods/Detail/{code}") };
        // rank, image, name, original_price, sale_price, discount_rate ...
        // parse_price: 콤마/공백 제거 후 첫 숫자 그룹
        if !name.is_empty() {
            products.push(HotProduct { rank, code, name, original_price, sale_price,
                                       discount_rate, image, detail_url });
        }
    }
    if products.is_empty() {
        return Err(AppError::Crawl("HOT 6 상품을 찾을 수 없습니다. 사이트 구조 변경 가능성".into()));
    }
    Ok(CrawlSnapshot { id: gen_id(), crawled_at: now_iso(), products })
}
```

### `parse_price` 동작 (기존과 동일)
- 입력 텍스트에서 `,`·공백 제거 → 첫 숫자 그룹(`\d+`)을 정수로. 없으면 `None`.

## 개별 상세 크롤링 (`crawl_product_detail`)

기존은 **JSON-LD 우선 + og 메타 폴백**.

1. `script[type="application/ld+json"]` 들을 파싱
   - `@type == "Product"` 또는 `name` 있는 JSON에서:
     `name`, `image`(배열이면 [0]), `description`, `offers.price`(배열이면 [0]),
     `aggregateRating.ratingValue`/`reviewCount` 추출
2. 비면 메타 폴백: `og:title`/`<title>`, `og:image`, `og:description`

```rust
// serde_json 으로 ld+json 파싱, 실패한 스크립트는 무시(continue)
```

반환: `{ url, name, original_price, sale_price, image, description, rating, review_count }`

## 주의

- **셀렉터 의존성이 큼**: 사이트 구조가 바뀌면 깨진다. 빈 결과 시 명확한 에러 메시지 반환(기존과 동일).
- 사이트가 **JS 렌더링으로 바뀌면** 순수 HTTP 파싱으로 부족할 수 있음 → 그때 webview 추출로 전환 고려
  (현재 결정: HTTP 파싱 유지. [../legacy-moon-project/07](../legacy-moon-project/07-tauri-migration-notes.md))
- 크롤링 결과(`CrawlSnapshot`)는 **바로 저장하지 않고** 프론트 미리보기 후 `save_snapshot`으로 저장(기존 플로우 유지).

## ID 생성 (기존 호환)

기존은 `Date.now().toString(36) + random` 형태. Rust에선 `uuid::Uuid::new_v4()` 문자열로 대체해도 무방
(스냅샷 id는 내부 식별자일 뿐 의미 없음).
