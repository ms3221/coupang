# 03. 쿠팡 WING API 연동

쿠팡 연동 코드는 `src/lib/coupang/` 에 **프로젝트 의존성 없는 독립 모듈**로 분리되어 있다.
(주석에 "독립 모듈 - 프로젝트 의존성 없음" 명시 → Tauri로 포팅 시 그대로 떼어내기 쉬움)

## Base URL

```
https://api-gateway.coupang.com
```

## HMAC-SHA256 서명 (`coupang/auth.ts`)

쿠팡 WING은 매 요청에 `Authorization` 헤더로 HMAC 서명을 요구한다.

### datetime 포맷
- **UTC** 기준 `yyMMddTHHmmssZ` (예: `260327T071000Z`)
- 연도는 4자리 중 뒤 2자리만 사용

### 서명 메시지 구성
```
message = datetime + method + pathOnly + queryString
```
- `path`를 `?` 기준으로 `pathOnly` 와 `queryString` 으로 분리
- queryString은 `?` 없이 이어붙임 (없으면 빈 문자열)

### 서명 계산
```
signature = HMAC_SHA256(secretKey, message).hex()
```

### Authorization 헤더 형식
```
CEA algorithm=HmacSHA256, access-key={accessKey}, signed-date={datetime}, signature={signature}
```

> Rust 포팅 시: `hmac` + `sha2` crate, datetime은 `chrono`의 UTC로 동일 포맷 생성.
> **주의**: datetime을 서명과 헤더에서 동일 값으로 써야 함 (요청 시점 1회 생성).

## HTTP 클라이언트 (`coupang/client.ts`)

`CoupangClient(accessKey, secretKey)` 클래스.

### `request<T>(method, path, body?)`
1. `generateSignature()` 로 Authorization 생성
2. 헤더: `Content-Type: application/json;charset=UTF-8`, `Authorization`
3. `fetch(BASE_URL + path)` 호출
4. 에러 처리 **두 단계**:
   - HTTP status !ok → `throw Error("Coupang API error {status}: {message}")`
   - **HTTP 200이어도 `json.code === "ERROR"` 면 throw** ← 쿠팡 특이사항

### `healthCheck()`
- 카테고리 메타 조회 API(카테고리 `37544`)를 GET 호출해서 인증 성공/실패만 판정
- `{ ok, message }` 반환

## 엔드포인트 모음

| 기능 | Method | Path |
|------|--------|------|
| 상품 생성 | POST | `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products` |
| 상품 수정(승인필요) | PUT | `.../seller-products` (body에 `sellerProductId`) |
| 상품 부분수정(승인불필요) | PUT | `.../seller-products/{id}/partial` |
| 상품 단건 조회 | GET | `.../seller-products/{id}` |
| 상품 승인 요청 | PUT | `.../seller-products/{id}/approvals` |
| 카테고리 메타 조회 | GET | `.../meta/category-related-metas/display-category-codes/{code}` |
| 카테고리 추천(AI) | POST | `/v2/providers/openapi/apis/api/v1/categorization/predict` |
| 반품지 조회 | GET | `/v2/providers/openapi/apis/api/v4/vendors/{vendorId}/returnShippingCenters` |
| 출고지 조회 | GET | `/v2/providers/marketplace_openapi/apis/api/v2/vendor/shipping-place/outbound?pageNum=1&pageSize=50` |

> `seller_api` / `openapi` / `marketplace_openapi` 로 prefix가 다른 점에 주의.

## 상품 API 래퍼 (`coupang/products.ts`)

| 함수 | 동작 |
|------|------|
| `createProduct(client, data)` | POST seller-products |
| `updateProduct(client, id, data)` | PUT seller-products (body에 id 병합) — 승인필요 |
| `updateProductPartial(client, id, partial)` | PUT .../{id}/partial — 승인불필요 |
| `getProduct(client, id)` | GET .../{id} → `statusName`, `items` 포함 |
| `approveProduct(client, id)` | PUT .../{id}/approvals |
| `predictCategory(client, params)` | POST categorization/predict |

## 응답 패턴 / 함정

- 응답 공통: `{ code, message, data }`
- **`data`가 객체가 아니라 숫자(sellerProductId)로 올 수 있음** → register route에서
  `typeof result.data === "number" ? result.data : result.data?.sellerProductId` 로 분기.
- 등록/수정 후 **5초 대기** 뒤 `getProduct`로 최신 `statusName` 재조회 (쿠팡 처리 지연 때문).
- `errorItems` 가 응답에 있으면 부분 성공/경고로 처리.

## 쿠팡 상태값 (`statusName`) → 내부 상태 매핑

| 쿠팡 statusName | 내부 DB status |
|-----------------|----------------|
| 승인완료 / 부분승인완료 | `approved` |
| 승인반려 | `rejected` |
| 상품삭제 | `deleted` |
| 그 외(심사중/임시저장/승인대기중 등) | `registered` |

전체 statusName 종류: `심사중, 임시저장, 승인대기중, 승인완료, 부분승인완료, 승인반려, 상품삭제`

## contents 형식 변환 (중요 함정)

상품 **생성**과 **수정**의 `contents` 필드 형식이 다르다.

- 생성 형식: `{ contentType: "TEXT"|"IMAGE", content: "..." }`
- 수정 형식: `{ contentsType: "TEXT", contentDetails: [{ content, detailType: "TEXT" }] }`

수정/재승인 시 `convertContentsForUpdate()` 로 생성 형식 → 수정 형식 변환.
(`update/route.ts`, `approve/route.ts` 에 변환 로직 존재. detailType/contentsType은 "TEXT"로 강제)

또한 수정 시에는 기존 상품을 `getProduct`로 조회해 각 item의
`sellerProductItemId`, `vendorItemId` 를 채워 넣어야 한다 (없으면 수정 실패).
