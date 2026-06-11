# 01. 시스템 개요

## 무엇인가

`moon_project`는 두 가지가 한 Next.js 프로젝트에 공존한다.

1. **온담(ondam) 카페 소개 사이트** — `/(main)` 라우트, 정적 랜딩 페이지 (Hero/About/Menu/Gallery 등)
2. **쿠팡 셀러 자동등록 어드민** — `/admin` 라우트 (이 문서들의 관심 대상)

카페 사이트는 무관하고, **재구현 대상은 어드민(쿠팡 자동등록) 부분**이다.

## 어드민이 하는 일

```
[한경 hankyeong.kr 크롤링]  →  [상품 데이터 확보]  →  [쿠팡 WING API 등록]  →  [승인/수정/상태관리]
```

1. **크롤링**: `hankyeong.kr` 메인의 "시골농부 HOT 6" 상품(순위/이름/가격/이미지)을 수집
2. **임시저장(draft)**: 크롤링한 상품을 등록 폼 초안으로 저장
3. **상품등록**: 폼을 채워 쿠팡 WING API(`POST seller-products`)로 상품 생성
4. **승인 요청**: 등록된 상품을 승인 신청. 승인반려 시 수정 후 자동 재승인
5. **상태 동기화**: 쿠팡에서 최신 상태(심사중/승인완료/승인반려 등)를 주기적으로 끌어와 DB 갱신

대상 사용자는 **운영자 1인**(단일 비밀번호 로그인).

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 15 (App Router, Turbopack), React 19 |
| 언어 | TypeScript 5.7 |
| 스타일 | Tailwind CSS 4 |
| DB / 백엔드 | Supabase (Postgres) — `@supabase/supabase-js`, **service role key** 사용 |
| 크롤링 | `cheerio` (서버사이드 fetch + HTML 파싱) |
| 외부 API | 쿠팡 WING OpenAPI (HMAC-SHA256 서명) |
| 인증 | 쿠키 기반 단일 세션 (고정 토큰) |
| 패키지 매니저 | yarn |
| dev 포트 | 4000 (`next dev --turbopack -p 4000`) |

## 핵심 환경변수 (`.env.local`)

| 키 | 용도 |
|----|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role 키 (RLS 우회, 서버 전용) |
| `COUPANG_ACCESS_KEY` | 쿠팡 WING API access key |
| `COUPANG_SECRET_KEY` | 쿠팡 WING API secret key (HMAC 서명용) |

> 쿠팡 셀러 기본정보(vendorId, 반품지, 출고지 등)는 env가 아니라 **Supabase `settings` 테이블**에 저장된다. (03·04 문서 참조)

## 아키텍처 특징 / 제약

- **모든 쿠팡·DB 호출이 Next.js API Route(서버)에서 일어남.** 브라우저는 `/api/admin/*`만 호출.
  → 쿠팡 API에 CORS·서명이 필요하고 secret key를 노출하면 안 되기 때문.
- Supabase를 **service role 키**로 직접 호출 → RLS 없이 서버에서 전권 접근.
- 인증은 미들웨어가 쿠키 하나로 처리하는 매우 단순한 구조 (멀티유저 아님).
- 크롤링 대상 사이트(hankyeong.kr)의 **HTML 구조에 강하게 의존** → 구조 변경 시 깨짐.

## Tauri 재구현 관점에서의 함의 (요약)

- 서버 사이드에서만 하던 일(쿠팡 서명/호출, 크롤링, DB)을 **Rust 백엔드(`#[tauri::command]`)** 로 옮기면 secret key를 안전하게 로컬에 둘 수 있다.
- Supabase 의존을 **로컬 DB(SQLite 등)** 로 대체할지, 그대로 둘지 결정 필요. (07 문서)
- 자세한 건 [07-tauri-migration-notes.md](./07-tauri-migration-notes.md).
