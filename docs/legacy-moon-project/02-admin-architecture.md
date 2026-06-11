# 02. 어드민 아키텍처 (라우팅 / 인증)

## 디렉토리 구조 (어드민 관련만)

```
src/
├── middleware.ts                  # /admin, /api/admin 보호
├── lib/
│   ├── auth.ts                    # 쿠키 세션 헬퍼
│   ├── supabase.ts                # service role 클라이언트
│   ├── settings.ts                # settings 테이블 CRUD
│   ├── crawler.ts                 # hankyeong.kr 크롤러 (cheerio)
│   └── coupang/                   # 쿠팡 WING API 독립 모듈
│       ├── index.ts               #   배럴 export
│       ├── client.ts              #   HTTP 클라이언트 + healthCheck
│       ├── auth.ts                #   HMAC-SHA256 서명 생성
│       ├── products.ts            #   상품 CRUD/승인/카테고리추천
│       └── types.ts               #   WING API 타입 정의
└── app/
    ├── admin/
    │   ├── layout.tsx             # 어드민 레이아웃 (11줄)
    │   ├── page.tsx               # 대시보드 (크롤링 탭 + 쿠팡상품 탭)
    │   ├── login/page.tsx         # 로그인 (73줄)
    │   ├── register/page.tsx      # 상품 등록 폼 (1646줄, 핵심)
    │   └── edit/page.tsx          # 상품 수정 폼 (996줄, register와 유사)
    └── api/admin/
        ├── auth/route.ts          # 로그인/로그아웃
        ├── crawl/route.ts         # 크롤링 실행
        ├── products/route.ts      # 크롤 스냅샷 CRUD
        ├── drafts/route.ts        # 임시저장 CRUD
        ├── settings/route.ts      # 전체 설정 GET/PUT
        └── coupang/
            ├── config/route.ts    # 쿠팡 셀러 기본정보 GET/PUT
            ├── health/route.ts    # API 키 유효성 체크
            ├── category/route.ts  # 카테고리 AI 추천 (POST)
            ├── meta/route.ts      # 카테고리 메타(고시정보/옵션) 조회
            ├── lookup/route.ts    # 반품지/출고지 코드 조회
            ├── register/route.ts  # 상품 생성 (POST)
            ├── update/route.ts    # 상품 수정 (POST)
            ├── approve/route.ts   # 승인 요청 (PUT, 재승인 로직 포함)
            ├── product/route.ts   # 단건 조회 + DB 동기화 (GET)
            └── products/route.ts  # 등록상품 목록 (GET)
```

## 인증 / 보호

### 미들웨어 (`src/middleware.ts`)

```
matcher: ["/admin/:path*", "/api/admin/:path*"]
```

- `/admin/login` 과 `/api/admin/auth` 는 **통과**(예외)
- 그 외 `/admin/**`, `/api/admin/**` 는 쿠키 검사
  - 쿠키 `admin_session` 값이 고정 토큰 `harudam_admin_authenticated` 와 다르면:
    - API 경로 → `401 {error:"Unauthorized"}`
    - 페이지 경로 → `/admin/login` 으로 리다이렉트

### 세션 (`src/lib/auth.ts`)

- 쿠키 이름: `admin_session`
- 고정 토큰값: `harudam_admin_authenticated` (사실상 "로그인됨" 플래그)
- 쿠키 옵션: `httpOnly`, `sameSite=lax`, `maxAge=24h`, `secure`(prod만)
- `isAuthenticated()`: 쿠키값 == 토큰 비교

### 로그인 API (`POST /api/admin/auth`)

1. body 의 `password` 수신
2. Supabase `settings.admin_password` 값과 **평문 비교**
3. 일치하면 세션 쿠키 set, 불일치 401, 미설정 500

> ⚠️ 보안 특징: 비밀번호 평문 저장/비교, 고정 세션 토큰. 1인용 내부 도구라 단순화한 것.
> Tauri로 옮기면 네트워크 인증 자체가 불필요해질 수 있음(로컬 앱).

## 대시보드 페이지 (`/admin`)

`src/app/admin/page.tsx` — 탭 2개:

### 탭 1: "크롤링" (`?tab=crawl`)
- `[지금 크롤링]` → `POST /api/admin/crawl` → 결과 미리보기
- `[저장하기]` → `POST /api/admin/products` (스냅샷 저장)
- 크롤링 히스토리(스냅샷 목록) 표시/펼침/삭제
- 각 상품 카드의 `[쿠팡 등록]` → draft 생성 후 `/admin/register?draftId=...` 이동
- 이미 등록된 상품 코드는 "등록완료" 배지

### 탭 2: "쿠팡 상품" (`?tab=products`)
- 상단 상태 요약 카드 4개: 임시저장 / 등록완료 / 승인완료 / 승인반려 (카운트)
- **등록된 상품 목록** (`registered_products`)
  - `[상태 동기화]` → 모든 상품에 대해 `GET /api/admin/coupang/product?...` 병렬 호출
  - `[+ 새 상품 등록]` → `/admin/register`
  - 각 항목: `[편집]`(`/admin/edit?id=`), `[승인 요청]`/`[재승인 요청]`
- **임시저장 목록** (`draft_registrations` 중 status=draft)
  - `[편집]`(`/admin/register?draftId=`), `[삭제]`

## 페이지 ↔ API 호출 맵

| UI 동작 | 호출하는 API |
|---------|-------------|
| 크롤링 | `POST /api/admin/crawl` |
| 스냅샷 저장/조회/삭제 | `POST/GET/DELETE /api/admin/products` |
| 임시저장 CRUD | `POST/GET/DELETE /api/admin/drafts` |
| 상품 등록 | `POST /api/admin/coupang/register` |
| 상품 수정 | `POST /api/admin/coupang/update` |
| 승인/재승인 | `PUT /api/admin/coupang/approve` |
| 단건 조회+동기화 | `GET /api/admin/coupang/product?sellerProductId=&registeredProductId=` |
| 등록상품 목록 | `GET /api/admin/coupang/products` |
| 카테고리 AI 추천 | `POST /api/admin/coupang/category` |
| 카테고리 메타 | `GET /api/admin/coupang/meta?categoryCode=` |
| 반품지/출고지 조회 | `GET /api/admin/coupang/lookup` |
| API 인증 테스트 | `GET /api/admin/coupang/health` |
| 쿠팡 기본설정 조회/저장 | `GET/PUT /api/admin/coupang/config` |
| 전체 설정 | `GET/PUT /api/admin/settings` |
| 로그인/로그아웃 | `POST/DELETE /api/admin/auth` |
