# 02. 프로젝트 셋업 (기술스택 / 폴더 구조)

## 기술 스택

### 백엔드 (Rust)
| 용도 | crate |
|------|-------|
| Tauri 코어 | `tauri` (v2) |
| SQLite | `tauri-plugin-sql` (sqlite feature) **또는** `rusqlite` + `r2d2` |
| HTTP 클라이언트 | `reqwest` (json, rustls-tls feature) |
| HMAC 서명 | `hmac`, `sha2`, `hex` |
| 시간(UTC datetime) | `chrono` |
| HTML 파싱(크롤링) | `scraper` |
| 직렬화 | `serde`, `serde_json` |
| UUID | `uuid` (v4) |
| 에러 | `thiserror` / `anyhow` |
| (선택) 비밀 저장 | `tauri-plugin-stronghold` 또는 OS keyring |

> **DB 접근 방식 선택**: `tauri-plugin-sql`(프론트에서 SQL 직접 호출, 마이그레이션 내장)이 빠르지만,
> 본 설계는 **로직을 Rust 커맨드에 모으므로 `rusqlite`를 백엔드에서 직접 쓰는 쪽을 권장**한다.
> (비밀키·서명과 DB를 같은 레이어에서 다루기 위함. 04 문서 참조)

### 프론트엔드
| 용도 | 패키지 |
|------|--------|
| 프레임워크 | React 19 |
| 번들러 | Vite |
| 스타일 | Tailwind CSS |
| 라우팅 | React Router (Next.js App Router 대체) |
| Tauri 브릿지 | `@tauri-apps/api` (`invoke`, `event`) |

> 기존 Next.js 페이지는 **App Router → React Router**, **`fetch` → `invoke`** 로 바꿔 이식.
> 컴포넌트 마크업/Tailwind 클래스는 거의 그대로 재사용 가능.

## 프로젝트 폴더 구조 (제안)

```
coupang_tauri/
├── docs/                          # (현재) 문서
├── src/                           # 프론트엔드 (React + Vite)
│   ├── main.tsx
│   ├── App.tsx                    # 라우터
│   ├── routes/
│   │   ├── Dashboard.tsx          # 기존 admin/page.tsx
│   │   ├── Register.tsx           # 기존 admin/register/page.tsx
│   │   ├── Edit.tsx               # 기존 admin/edit/page.tsx
│   │   └── Settings.tsx           # 신규: 쿠팡 키/셀러정보 입력
│   ├── lib/
│   │   ├── api.ts                 # invoke 래퍼 (커맨드별 타입 함수)
│   │   └── types.ts               # 프론트 타입 (Rust struct 미러)
│   └── components/                # 재사용 UI
├── src-tauri/                     # 백엔드 (Rust)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── migrations/                # SQL 마이그레이션
│   │   └── 0001_init.sql
│   └── src/
│       ├── main.rs                # 앱 부트스트랩, 커맨드 등록
│       ├── db.rs                  # SQLite 연결/풀, 마이그레이션 적용
│       ├── error.rs               # 공통 에러 타입
│       ├── settings.rs            # settings 테이블 CRUD
│       ├── crawler.rs             # 크롤링
│       ├── coupang/
│       │   ├── mod.rs
│       │   ├── auth.rs            # HMAC 서명
│       │   ├── client.rs          # reqwest 클라이언트 + request<T>
│       │   ├── products.rs        # 상품 CRUD/승인/카테고리
│       │   └── types.rs           # WING 타입
│       └── commands/              # #[tauri::command] 핸들러
│           ├── mod.rs
│           ├── crawl.rs
│           ├── drafts.rs
│           ├── snapshots.rs
│           ├── coupang.rs
│           └── settings.rs
├── package.json
└── vite.config.ts
```

## 스캐폴딩 절차 (제안)

```bash
# 1) Tauri v2 + React + TS 템플릿 생성
npm create tauri-app@latest    # → React, TypeScript, Vite 선택

# 2) 프론트 의존성
npm i @tauri-apps/api react-router-dom
npm i -D tailwindcss @tailwindcss/postcss postcss autoprefixer

# 3) Rust 의존성 (src-tauri/Cargo.toml)
#    reqwest, hmac, sha2, hex, chrono, scraper, serde, serde_json,
#    uuid, rusqlite (또는 tauri-plugin-sql), thiserror
```

> 정확한 버전·feature 플래그는 스캐폴딩 시점에 최신 안정 버전으로 맞춘다.
> Tauri는 **v2** 기준 (커맨드/플러그인 API가 v1과 다름).

## 설정/비밀키 저장 위치

- DB 파일: `app_data_dir()/coupang_tauri/data.db`
- 쿠팡 키: 기본은 `settings` 테이블(로컬 SQLite)에 저장.
  - 보안을 더 원하면 `tauri-plugin-stronghold`/OS keyring으로 분리 가능(선택).
  - 로컬 단일 사용자 도구라 1차 구현은 settings 테이블로 충분.
