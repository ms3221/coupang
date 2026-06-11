# 06. 상품등록 폼 / 요청 JSON 레퍼런스

`src/app/admin/register/page.tsx` (1646줄) 기준. 수정 폼(`edit/page.tsx`, 996줄)도 거의 동일.

## 폼 섹션 구성 (UI)

| # | 섹션 | 주요 필드 |
|---|------|-----------|
| 1 | 기본 정보 | 등록상품명*, 노출상품명, 브랜드, 제품명, 카테고리코드*, 상품그룹 |
| 2 | 가격/재고 | 원가, 판매가격*, 판매가능수량, 인당최대구매, 출고소요일, 검색태그[] |
| 3 | 배송 설정 | 배송방법, 택배사, 배송비종류, 기본배송비, 무료배송기준, 반품배송비, 도서산간, 묶음배송 |
| 4 | 반품/출고지 | vendorId, vendorUserId, 반품지센터코드, 반품지명, 연락처, 우편번호, 주소, 상세주소, 출고지코드 |
| 5 | 이미지 | 대표이미지URL*, 상세이미지URL[] |
| 6 | 옵션/속성 | attributes[] (속성명/속성값) |
| 7 | 상품고시정보 | notices[] (카테고리/항목/내용) |
| 8 | 상세 컨텐츠 | contents[] (TEXT/HTML 또는 IMAGE URL) |
| 9 | 기타 설정 | 과세여부, 19세이상, 병행수입, 해외구매대행, A/S정보, A/S연락처 |

(*) 필수.

## 폼 상태 → 기본값

| 필드 | 기본값 |
|------|--------|
| maximumBuyCount | `"999"` |
| maximumBuyForPerson | `"0"` (0=무제한) |
| outboundShippingTimeDay | `"2"` |
| deliveryMethod | `"SEQUENCIAL"` |
| deliveryCompanyCode | `"KGB"` (로젠택배) |
| deliveryChargeType | `"FREE"` |
| deliveryCharge / freeShipOverAmount | `"0"` |
| returnCharge | `"5000"` |
| remoteAreaDeliverable | `"N"` |
| unionDeliveryType | `"NOT_UNION_DELIVERY"` |
| taxType | `"TAX"` |
| adultOnly | `"EVERYONE"` |
| parallelImported | `"NOT_PARALLEL_IMPORTED"` |
| overseasPurchased | `"NOT_OVERSEAS_PURCHASED"` |
| contents | TEXT 한 줄 |
| requested | `true` (단, 실제 전송 시엔 `false`로 보냄 — 아래 주의) |

## select 옵션값

**배송방법**: SEQUENCIAL(순차배송) / COLD_FRESH(냉장·냉동) / MAKE_ORDER(주문제작) / AGENT_BUY(구매대행) / VENDOR_DIRECT(업체직송)
**택배사**: KGB(로젠) / CJGLS(CJ대한통운) / HANJIN(한진) / HYUNDAI(현대) / EPOST(우체국)
**배송비종류**: FREE / NOT_FREE / CONDITIONAL_FREE / CHARGE_RECEIVED(착불)
**도서산간**: N / Y
**묶음배송**: NOT_UNION_DELIVERY / UNION_DELIVERY
**과세**: TAX / FREE
**19세**: EVERYONE / ADULT_ONLY
**병행수입**: NOT_PARALLEL_IMPORTED / PARALLEL_IMPORTED
**해외구매대행**: NOT_OVERSEAS_PURCHASED / OVERSEAS_PURCHASED

## 제출 시 쿠팡 요청 본문 (handleSubmit)

`POST /api/admin/coupang/register` 로 보내는 JSON 구조:

```jsonc
{
  "draftId": "...",                    // 내부용(라우트에서 분리)
  "displayCategoryCode": 12345,        // Number 변환
  "sellerProductName": "...",
  "vendorId": "...",
  "saleStartedAt": "2026-06-11T12:00:00",   // now.toISOString().slice(0,19)
  "saleEndedAt": "2099-01-01T23:59:59",     // 고정 미래값
  "displayProductName": "...",
  "brand": "...",
  "generalProductName": "...",
  "productGroup": "",
  "deliveryMethod": "SEQUENCIAL",
  "deliveryCompanyCode": "KGB",
  "deliveryChargeType": "FREE",
  "deliveryCharge": 0,
  "freeShipOverAmount": 0,
  "deliveryChargeOnReturn": 5000,      // returnCharge 값 사용
  "remoteAreaDeliverable": "N",
  "unionDeliveryType": "NOT_UNION_DELIVERY",
  "returnCenterCode": "...",
  "returnChargeName": "...",
  "companyContactNumber": "...",
  "returnZipCode": "...",
  "returnAddress": "...",
  "returnAddressDetail": "...",
  "returnCharge": 5000,
  "returnChargeVendor": "BUYER",       // 고정
  "afterServiceInformation": "판매자 문의",  // 비면 기본값
  "afterServiceContactNumber": "...",
  "outboundShippingPlaceCode": 12345,  // Number
  "vendorUserId": "...",
  "requested": false,                  // ★ 폼 기본 true지만 전송은 false
  "items": [
    {
      "itemName": "{sellerProductName과 동일}",
      "originalPrice": 0,              // 비면 salePrice 사용
      "salePrice": 0,
      "maximumBuyCount": 999,
      "maximumBuyForPerson": 0,
      "maximumBuyForPersonPeriod": 1, // 고정
      "outboundShippingTimeDay": 2,
      "unitCount": 1,                 // 고정
      "adultOnly": "EVERYONE",
      "taxType": "TAX",
      "parallelImported": "NOT_PARALLEL_IMPORTED",
      "overseasPurchased": "NOT_OVERSEAS_PURCHASED",
      "pccNeeded": false,             // 고정
      "bestPriceGuaranteed3P": false, // 고정
      "searchTags": ["..."],          // 빈 값 필터
      "images": [
        { "imageOrder": 0, "imageType": "REPRESENTATION", "vendorPath": "{대표이미지}" },
        { "imageOrder": 1, "imageType": "DETAIL", "vendorPath": "{상세이미지}" }
        // detailImages 빈 값 필터 후 순번
      ],
      "notices": [
        { "noticeCategoryName": "...", "noticeCategoryDetailName": "...", "content": "..." }
        // name && content 있는 것만
      ],
      "attributes": [
        { "attributeTypeName": "...", "attributeValueName": "..." }
        // 둘 다 있는 것만
      ],
      "contents": [
        { "contentType": "TEXT", "content": "..." }  // content 있는 것만 (생성 형식)
      ],
      "offerCondition": "NEW",        // 고정
      "offerDescription": ""          // 고정
    }
  ]
}
```

### 제출 시 변환/고정값 메모
- 모든 숫자 필드는 `Number()` 변환 후 전송 (폼 상태는 string).
- `originalPrice` 비면 `salePrice` 로 대체.
- `itemName` = `sellerProductName`.
- 고정값: `returnChargeVendor=BUYER`, `requested=false`, `maximumBuyForPersonPeriod=1`,
  `unitCount=1`, `pccNeeded=false`, `bestPriceGuaranteed3P=false`, `offerCondition=NEW`,
  `saleEndedAt=2099-01-01T23:59:59`.
- 단일 item만 지원 (옵션 상품 X) — `items` 배열 길이 항상 1.

## draft `form_data` 에 저장되는 키 (collectFormData)

```
sellerProductName, displayProductName, brand, generalProductName,
displayCategoryCode, productGroup, originalPrice, salePrice,
maximumBuyCount, maximumBuyForPerson, outboundShippingTimeDay,
deliveryMethod, deliveryCompanyCode, deliveryChargeType, deliveryCharge,
freeShipOverAmount, returnCharge, remoteAreaDeliverable, unionDeliveryType,
representImage, detailImages, attributes, notices, contents,
taxType, adultOnly, parallelImported, overseasPurchased,
afterServiceInfo, afterServiceContact, searchTags, requested
```

(쿠팡 요청 본문과 키 이름이 1:1로 안 맞음 — 폼 내부 키. register route에서 쿠팡 형식으로 재조립)

## 보조 기능 동작

- **AI 카테고리 추천**: 상품명(+브랜드) → `predictedCategoryId` 를 카테고리코드에 채움.
- **메타 불러오기**: 카테고리코드로 `meta` 조회 →
  - `noticeCategories[0]` 의 항목들을 notices에 자동 채움 (content="상세페이지 참조")
  - `attributes` 중 `required==="MANDATORY"` 인 것만 빈 값으로 attributes에 채움
- **반품지/출고지 불러오기**: lookup 결과 클릭 시 관련 필드 일괄 채움(`applyReturnCenter`, `applyShippingPlace`).
