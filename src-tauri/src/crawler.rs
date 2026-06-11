// 고도몰(godo) BEST/HOT 6 크롤러
// 한경(hankyeong.kr "시골농부 HOT 6")·전라도청년(jeollayouth.com "오늘의 BEST 6")은
// 동일한 고도몰 테마 마크업을 써서 같은 셀렉터로 파싱한다 (2026-06 실제 구조 검증):
//  - 상품 단위: data-mgcode 를 가진 .col-xs-6 (BEST/HOT 영역에 6개)
//  - data-mgcode: .col-xs-6 > .allWrap[data-mgcode]  (한경 SGK..., 전라 SQQ...)
//  - .panel.prod 내부: img.img-responsive(src), .dc-rank(순위),
//    h4.prod-title(상품명), .org-price(원가), .price(판매가), .dc-rate(할인율)
//  - 상세 URL: {base_url}/Goods/Detail/{mgcode}

use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::now_iso;
use crate::error::AppError;

const UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/// 크롤 사이트 사양. 마크업이 동일하므로 base_url만 다르다.
/// (표시 라벨은 프론트 lib/sites.ts의 SITES가 담당)
pub struct SiteSpec {
    pub source: &'static str,
    pub category: &'static str,
    pub base_url: &'static str,
}

/// source 문자열 → 사이트 사양. 미등록 사이트는 None.
pub fn site_spec(source: &str) -> Option<SiteSpec> {
    match source {
        "hankyeong" => Some(SiteSpec {
            source: "hankyeong",
            category: "hot6",
            base_url: "https://www.hankyeong.kr",
        }),
        "jeollayouth" => Some(SiteSpec {
            source: "jeollayouth",
            category: "best6",
            base_url: "https://www.jeollayouth.com",
        }),
        _ => None,
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HotProduct {
    pub rank: i64,
    pub code: String,
    pub name: String,
    pub original_price: Option<i64>,
    pub sale_price: Option<i64>,
    pub discount_rate: Option<String>,
    pub image: Option<String>,
    pub detail_url: String,
}

/// "43,900원" → 43900. 숫자만 추출.
fn parse_price(text: &str) -> Option<i64> {
    let digits: String = text.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}

fn text_of(el: &scraper::ElementRef, sel: &Selector) -> String {
    el.select(sel)
        .next()
        .map(|e| e.text().collect::<String>().trim().to_string())
        .unwrap_or_default()
}

/// 메인 페이지에서 BEST/HOT 6 상품을 크롤한다. (DB 저장 안 함)
pub async fn crawl_best6(
    http: &reqwest::Client,
    base_url: &str,
) -> Result<Vec<HotProduct>, AppError> {
    let res = http
        .get(base_url)
        .header("User-Agent", UA)
        .send()
        .await
        .map_err(|e| AppError::Crawl(format!("페이지를 불러올 수 없습니다: {e}")))?;
    if !res.status().is_success() {
        return Err(AppError::Crawl(format!(
            "페이지를 불러올 수 없습니다: {}",
            res.status().as_u16()
        )));
    }
    let html = res
        .text()
        .await
        .map_err(|e| AppError::Crawl(e.to_string()))?;

    // Html은 Send가 아니므로 await가 끼지 않는 블록에서 파싱
    let products = parse_best6(&html, base_url);

    if products.is_empty() {
        return Err(AppError::Crawl(
            "BEST 6 상품을 찾을 수 없습니다. 사이트 구조가 변경되었을 수 있습니다.".into(),
        ));
    }

    Ok(products)
}

fn parse_best6(html: &str, base_url: &str) -> Vec<HotProduct> {
    let doc = Html::parse_document(html);

    let col_sel = Selector::parse(".col-xs-6").unwrap();
    let code_sel = Selector::parse("[data-mgcode]").unwrap();
    let panel_sel = Selector::parse(".panel.prod").unwrap();
    let img_sel = Selector::parse("img.img-responsive").unwrap();
    let rank_sel = Selector::parse(".dc-rank").unwrap();
    let title_sel = Selector::parse(".prod-title").unwrap();
    let org_sel = Selector::parse(".org-price").unwrap();
    let price_sel = Selector::parse(".price").unwrap();
    let rate_sel = Selector::parse(".dc-rate").unwrap();

    let mut products = Vec::new();

    for col in doc.select(&col_sel) {
        // data-mgcode가 있는 col만 BEST/HOT 상품
        let code = match col.select(&code_sel).next().and_then(|e| e.value().attr("data-mgcode")) {
            Some(c) if !c.is_empty() => c.to_string(),
            _ => continue,
        };

        // panel.prod 없으면 skip
        let Some(panel) = col.select(&panel_sel).next() else {
            continue;
        };

        let detail_url = format!("{base_url}/Goods/Detail/{code}");

        let rank_text = text_of(&panel, &rank_sel);
        let rank = rank_text.trim().parse::<i64>().unwrap_or((products.len() + 1) as i64);

        let image = panel
            .select(&img_sel)
            .next()
            .and_then(|e| e.value().attr("src"))
            .map(|s| s.to_string());

        let name = text_of(&panel, &title_sel);

        let original_price = parse_price(&text_of(&panel, &org_sel));

        // .price 는 판매가 (org-price는 "price" 클래스가 없어 매칭되지 않음)
        let sale_price = panel
            .select(&price_sel)
            .next()
            .map(|e| e.text().collect::<String>())
            .and_then(|t| parse_price(&t));

        let discount_rate = {
            let r = text_of(&panel, &rate_sel);
            if r.is_empty() {
                None
            } else {
                Some(r)
            }
        };

        if !name.is_empty() {
            products.push(HotProduct {
                rank,
                code,
                name,
                original_price,
                sale_price,
                discount_rate,
                image,
                detail_url,
            });
        }
    }

    products
}

#[cfg(test)]
mod tests {
    use super::*;

    // 실제 hankyeong.kr HOT 6 섹션 픽스처(2026-06)로 셀렉터 회귀 검증.
    // 사이트 구조가 바뀌어 이 테스트가 깨지면 parse_best6 셀렉터를 갱신해야 한다.
    #[test]
    fn parses_six_products() {
        let html = include_str!("../tests/fixtures/hankyeong_hot6.html");
        let products = parse_best6(html, "https://www.hankyeong.kr");

        assert_eq!(products.len(), 6, "HOT 6은 6개여야 함");

        let first = &products[0];
        assert!(first.code.starts_with("SGK"), "코드 추출 실패: {}", first.code);
        assert!(!first.name.is_empty(), "상품명 비어있음");
        assert!(first.sale_price.is_some(), "판매가 추출 실패");
        assert!(first.rank >= 1, "순위 추출 실패");
        assert!(
            first.detail_url.contains(&first.code),
            "상세 URL에 코드 포함 안 됨"
        );

        // 전 상품 코드/이름 채워짐
        assert!(products.iter().all(|p| !p.code.is_empty()));
        assert!(products.iter().all(|p| !p.name.is_empty()));
    }

    #[test]
    fn parse_price_handles_won() {
        assert_eq!(parse_price("43,900원"), Some(43900));
        assert_eq!(parse_price(" 11,900원 "), Some(11900));
        assert_eq!(parse_price("-"), None);
        assert_eq!(parse_price(""), None);
    }
}
