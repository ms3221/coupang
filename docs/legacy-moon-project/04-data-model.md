# 04. 데이터 모델 (Supabase)

모든 영속 데이터는 Supabase(Postgres)에 저장. 서버에서 **service role 키**로 접근(RLS 무시).
클라이언트: `src/lib/supabase.ts` — `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`

> 아래 컬럼은 코드(insert/select/update)에서 **역으로 추론**한 것이다.
> 실제 마이그레이션/스키마 파일은 저장소에 없음. (MCP supabase 서버로 실제 스키마 확인 가능: `.mcp.json` 에 project_ref `fprdpmgxpfrriccxcuqi`)

## 테이블 목록

### 1. `settings` — 키-값 설정 저장소
| 컬럼 | 비고 |
|------|------|
| `key` (PK) | 설정 키 |
| `value` | 문자열 값 |
| `updated_at` | upsert 시 갱신 |

저장되는 키들:
- `admin_password` — 어드민 로그인 비밀번호 (평문)
- `coupang_vendor_id`, `coupang_vendor_user_id`
- `coupang_return_center_code`, `coupang_return_charge_name`
- `coupang_company_contact_number`, `coupang_return_zip_code`
- `coupang_return_address`, `coupang_return_address_detail`
- `coupang_outbound_shipping_place_code`
- `coupang_after_service_information`, `coupang_after_service_contact_number`

접근 헬퍼: `src/lib/settings.ts` (`getSetting`, `getSettings`, `setSetting`, `setSettings`, `getAllSettings`, `getCoupangSettings`)

### 2. `crawl_snapshots` — 크롤링 스냅샷 (헤더)
| 컬럼 | 비고 |
|------|------|
| `id` (PK) | |
| `crawled_at` | 크롤링 시각 |
| `source` | `"hankyeong"` 고정 |
| `product_count` | 상품 수 |

- **하루 1스냅샷 정책**: 같은 날짜에 이미 있으면 기존 스냅샷+상품 삭제 후 재생성 (`products/route.ts` POST)

### 3. `crawled_products` — 크롤링 상품 (스냅샷 자식)
| 컬럼 | 비고 |
|------|------|
| `id` (PK) | |
| `snapshot_id` (FK→crawl_snapshots) | CASCADE 삭제 |
| `rank` | 순위 |
| `code` | 한경 상품코드 (data-mgcode) |
| `name` | 상품명 |
| `original_price` | 원가 |
| `sale_price` | 판매가 |
| `discount_rate` | 할인율 텍스트 |
| `image` | 이미지 URL |
| `detail_url` | 상세 페이지 URL |

### 4. `draft_registrations` — 임시저장 (등록 폼 초안)
| 컬럼 | 비고 |
|------|------|
| `id` (PK) | UUID |
| `product_code` | 한경 상품코드 (nullable) |
| `product_name` | 상품명 |
| `form_data` (jsonb) | 등록 폼 전체 상태 스냅샷 (06 문서 참조) |
| `status` | `draft` / `registered` / `approved` / `failed` |
| `coupang_product_id` | 등록 성공 시 sellerProductId (string) |
| `coupang_status` | 쿠팡 statusName |
| `created_at`, `updated_at` | |

### 5. `registered_products` — 쿠팡 등록 완료 상품 (이력/원본)
| 컬럼 | 비고 |
|------|------|
| `id` (PK) | UUID |
| `draft_id` (FK→draft_registrations, nullable) | |
| `seller_product_id` | 쿠팡 sellerProductId (숫자) |
| `product_name` | |
| `sale_price` | items[0].salePrice |
| `status` | `registered` / `approved` / `rejected` / `deleted` |
| `coupang_status` | 쿠팡 statusName (예: 심사중, 승인완료) |
| `request_data` (jsonb) | **쿠팡에 보낸/최신 상품 데이터** — 재승인·수정 시 원본으로 사용 |
| `response_data` (jsonb) | 쿠팡 응답 원본 |
| `registered_at`, `updated_at` | |

## 상태 머신

```
[크롤링 상품]
     │ "쿠팡 등록" 클릭
     ▼
draft_registrations.status = draft  ──삭제 가능
     │ register 폼 제출 (POST coupang/register 성공)
     ▼
draft.status = registered
registered_products 행 생성 (status=registered, coupang_status=임시저장/심사중...)
     │ "승인 요청" (PUT coupang/approve)
     ├─ 성공 ───────────────► status = approved (coupang_status=승인완료)
     ├─ 이미 승인됨 ─────────► status = approved (동기화)
     └─ 승인반려(rejected) ──► [수정 API로 임시저장 리셋 → 재승인]
                                  → status = registered, coupang_status = 심사중
```

- "상태 동기화"(`GET coupang/product`)는 쿠팡 실제 `statusName` 을 끌어와
  `mapCoupangStatusToDbStatus()` 로 내부 status를 갱신하고 `request_data` 도 최신화한다.
- 등록 실패 시 draft.status = `failed`.

## 두 status 체계 주의

- `draft_registrations.status`: `draft | registered | approved | failed`
- `registered_products.status`: `registered | approved | rejected | deleted`

둘이 별개이며 일부만 겹친다. 대시보드 카운트는 **registered_products 기준**(임시저장만 drafts 기준).
