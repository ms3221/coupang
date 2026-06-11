# 01. 아키텍처

## 큰 그림

```
┌─────────────────────────────────────────────────────────────┐
│                     Tauri 데스크톱 앱                          │
│                                                              │
│  ┌────────────────────────┐     invoke()     ┌────────────┐  │
│  │   Frontend (WebView)   │ ───────────────► │   Backend   │  │
│  │   React + Vite + TW    │ ◄─────────────── │   (Rust)    │  │
│  │                        │   결과 / event    │            │  │
│  │  - 대시보드             │                  │ #[command] │  │
│  │  - 등록/수정 폼         │                  │   핸들러    │  │
│  │  - 설정(키 입력)        │                  │            │  │
│  └────────────────────────┘                  └─────┬──────┘  │
│                                                     │         │
│                          ┌──────────────────────────┼───────┐ │
│                          ▼              ▼            ▼       │ │
│                   ┌──────────┐  ┌────────────┐ ┌─────────┐ │ │
│                   │  SQLite  │  │ Coupang API│ │ Crawler │ │ │
│                   │ (로컬파일) │  │  (reqwest) │ │(reqwest)│ │ │
│                   └──────────┘  └─────┬──────┘ └────┬────┘ │ │
│                                       │             │      │ │
└───────────────────────────────────────┼─────────────┼──────┘ │
                                        ▼             ▼
                              api-gateway.coupang.com  hankyeong.kr
```

## 레이어와 책임

| 레이어 | 기술 | 책임 |
|--------|------|------|
| Frontend | React + Vite + Tailwind | UI, 폼 상태, `invoke`로 백엔드 호출 |
| Bridge | Tauri `invoke` / `command` | 프론트 ↔ Rust 타입 안전 호출 |
| Backend (command) | Rust | 비즈니스 로직, 검증, 오케스트레이션 |
| DB | SQLite (`tauri-plugin-sql` 또는 `rusqlite`) | 영속 데이터 |
| Coupang | `reqwest` + `hmac`/`sha2` | WING API 호출·서명 |
| Crawler | `reqwest` + `scraper` | hankyeong.kr 파싱 |

## 기존(Next.js) → 신규(Tauri) 대응

| 기존 | 신규 |
|------|------|
| 브라우저 React 페이지 | WebView React 페이지 (거의 그대로) |
| `fetch("/api/admin/...")` | `invoke("command_name", {...})` |
| Next.js API Route (서버) | Rust `#[tauri::command]` |
| `lib/coupang/*` (TS) | Rust `coupang` 모듈 |
| `lib/crawler.ts` (cheerio) | Rust `crawler` 모듈 (scraper) |
| Supabase (Postgres) | 로컬 SQLite |
| `settings` 테이블(+admin_password) | `settings` 테이블 (admin_password 제거) |
| 쿠키 인증 + 미들웨어 | **제거** (로컬 앱) |

## 핵심 설계 원칙

1. **비밀키는 백엔드에만**: 쿠팡 secret key는 Rust(백엔드)에서만 읽고 서명. 프론트로 절대 노출 X.
2. **프론트는 얇게**: 폼·표시 위주. 무거운 로직(서명, 상태매핑, contents 변환)은 전부 Rust.
3. **경로는 Tauri API로**: DB 파일·설정은 `app_data_dir`. 하드코딩 금지.
4. **기존 동작 보존**: 5초 대기, 상태 매핑, contents 변환 등 검증된 동작은 그대로 옮긴다.
5. **타입 공유**: Rust struct ↔ TS interface를 맞춰 직렬화 경계에서 어긋나지 않게.

## 데이터 흐름 예시 (상품 등록)

```
[프론트] 등록 폼 제출
   → invoke("coupang_register_product", { draftId, product })
[Rust] coupang_register_product()
   1. draft 중복 체크 (SQLite)
   2. 쿠팡 createProduct (서명 + reqwest)
   3. sellerProductId 추출 (숫자/객체 분기)
   4. 5초 대기 → getProduct로 최신 statusName
   5. registered_products INSERT (SQLite)
   6. draft status=registered UPDATE
   → 결과 반환
[프론트] 결과 표시
```

기존 `register/route.ts` 로직과 동일. 차이는 "HTTP route" → "Rust command", "Supabase" → "SQLite".
