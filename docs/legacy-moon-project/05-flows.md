# 05. 주요 플로우

## A. 크롤링 플로우

```
[지금 크롤링] (admin/page.tsx handleCrawl)
  → POST /api/admin/crawl { type: "hot6" }
  → crawlHot6() (lib/crawler.ts)
      fetch https://www.hankyeong.kr (User-Agent 위장)
      cheerio 로 .brd-recommen .panel.prod 순회
      각 상품: code(data-mgcode), rank, image, name, originalPrice, salePrice, discountRate, detailUrl
  → CrawlSnapshot { id, crawledAt, products[] } 반환 (아직 DB 미저장)
  → 화면 미리보기

[저장하기] (handleSave)
  → POST /api/admin/products (snapshot 본문)
  → 같은 날 스냅샷 있으면 삭제 후
  → crawl_snapshots + crawled_products insert
```

개별 상세 크롤링도 가능: `POST /api/admin/crawl { type:"detail", url }` → `crawlProductDetail(url)`
(JSON-LD `application/ld+json` 파싱 + og 메타 폴백으로 name/image/price/rating 추출)

### 크롤링 셀렉터 의존성 (깨지기 쉬움)
| 데이터 | 셀렉터 |
|--------|--------|
| 상품 아이템 | `.brd-recommen .panel.prod` |
| 상품코드 | `.itemprod[data-mgcode]` |
| 순위 | `.dc-rank` |
| 이미지 | `img.img-responsive[src]` |
| 상품명 | `.prod-title` |
| 원가 | `.org-price` |
| 판매가 | `.price:not(.org-price)` 첫번째 |
| 할인율 | `.dc-rate` |

## B. 상품 등록 플로우

```
크롤링 카드 [쿠팡 등록] (ProductGrid handleCoupangRegister)
  → POST /api/admin/drafts (product_code, product_name, form_data 일부 프리필)
  → draft 생성 → window.location = /admin/register?draftId=...

register 페이지 진입
  → GET /api/admin/coupang/config (셀러 기본정보 프리필: vendorId, 반품지, 출고지...)
  → GET /api/admin/drafts?id=... (form_data 복원, restoreFormData)

[보조 동작]
  - [AI 추천]    POST /api/admin/coupang/category  → displayCategoryCode 자동 채움
  - [메타 불러오기] GET /api/admin/coupang/meta?categoryCode= → 고시정보/필수옵션 자동 채움
  - [반품지/출고지 불러오기] GET /api/admin/coupang/lookup → 클릭해서 적용
  - [API 인증 테스트] GET /api/admin/coupang/health
  - [임시저장]   POST /api/admin/drafts (form_data 전체)

[쿠팡에 등록] (handleSubmit)
  → requestBody 조립 (06 문서 참조, requested:false 로 보냄)
  → POST /api/admin/coupang/register { draftId, ...productData }
      중복방지: draft가 이미 registered면 409
      createProduct() 호출
      sellerProductId 추출 (data가 숫자 or 객체)
      5초 대기 → getProduct로 최신 statusName 조회
      registered_products insert (request_data=최신, response_data=원본)
      draft.status = registered, coupang_product_id 기록
  → 성공 시 결과 표시, draftStatus=registered (버튼 "등록완료"로 잠김)
```

## C. 승인 / 재승인 플로우

```
[승인 요청] (PUT /api/admin/coupang/approve { sellerProductId, draftId? })
  1. approveProduct() 시도
     성공 → status=approved, coupang_status=승인완료
  2. 실패 시 에러 메시지에 "임시저장" 포함 여부로 분기
     포함 안 됨 → throw (실제 에러)
     포함 됨 → getProduct로 실제 statusName 확인:
        ├ 승인완료/부분승인완료 → 이미 승인됨 (alreadyApproved=true) 동기화
        ├ 승인반려 → [재승인 절차]:
        │     registered_products.request_data(원본) 로드
        │     기존 items의 sellerProductItemId/vendorItemId 병합
        │     contents 형식 변환 (생성→수정 형식)
        │     updateProduct() (임시저장 상태로 리셋)
        │     approveProduct() 재호출
        │     → status=registered, coupang_status=심사중, reapproved=true
        └ 그 외(심사중 등) → 400 "현재 상태라 승인 불가"
```

## D. 상품 수정 플로우

```
대시보드 [편집] → /admin/edit?id={registeredProductId}
  → 폼 로드 (registered_products.request_data 기반)

수정 제출
  → POST /api/admin/coupang/update { registeredProductId, ...productData }
      registered_products 에서 seller_product_id 조회
      getProduct로 기존 items 조회 → sellerProductItemId/vendorItemId 확보
      convertContentsForUpdate (생성→수정 형식, contentsType/detailType="TEXT" 강제)
      updateProduct() 호출
      5초 대기 → getProduct로 최신 statusName
      registered_products 갱신 (request_data, product_name, sale_price, status, coupang_status)
```

## E. 상태 동기화 플로우

```
[상태 동기화] (handleSyncAll)
  → registered_products 전체에 대해 병렬:
     GET /api/admin/coupang/product?sellerProductId=&registeredProductId=
       getProduct() → statusName
       mapCoupangStatusToDbStatus() → 내부 status
       registered_products update (status, coupang_status, request_data=detail)
  → 목록 새로고침
```

## 타이밍 / 사이드이펙트 주의

- register/update route는 **요청 안에서 5초 `setTimeout`** 으로 블로킹 → 응답 지연 ~5초+.
  (쿠팡이 상품 처리하는 시간을 기다리는 것. Tauri 포팅 시 백그라운드 작업/폴링으로 개선 여지)
- approve route의 재승인은 **여러 API를 순차 호출**(get→update→approve)하므로 더 오래 걸림.
