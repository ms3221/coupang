# Tauri 앱 구현 문서 (coupang_tauri)

기존 `moon_project`의 쿠팡 셀러 자동등록 어드민을 **Tauri 데스크톱 앱**으로 재구현하기 위한
**설계·구현 문서**. (기존 코드 분석은 [`../legacy-moon-project/`](../legacy-moon-project/README.md) 참조)

> 이 폴더는 **새로 만들 앱의 설계/구현 전용**이다. 기존 코드 분석과 섞지 않는다.

## 한 줄 정의

> macOS/Windows에서 도는 **로컬 데스크톱 앱**. 한경(hankyeong.kr) HOT 6 상품을 크롤링해
> 쿠팡 WING API로 등록·수정·승인하고, 모든 데이터는 **앱 내장 로컬 SQLite**에 저장한다.
> 서버·외부 DB·로그인 없음. 사용자는 첫 실행 시 본인 쿠팡 키만 입력한다.

## 확정 설계 결정 (요약)

| 항목 | 결정 |
|------|------|
| 형태 | Tauri 데스크톱 앱 (Rust 백엔드 + React/Vite 프론트) |
| DB | 앱 내장 **로컬 SQLite** (별도 설치 불필요) |
| 키/설정 저장 | 로컬 저장 (서버 노출 없음) |
| 대상 OS | macOS + Windows |
| 로그인/인증 | **없음** — 대신 "쿠팡 키 입력 설정" 화면 |
| 5초 대기 | 기존 동작 그대로 유지 |
| 프론트엔드 | 기존 React 컴포넌트 재사용 후 개선 |
| 크롤링 | 기존 HTTP 파싱 그대로 |
| 카페 사이트 | 제외 (어드민 기능만) |

(근거·배경은 `../legacy-moon-project/07-tauri-migration-notes.md`)

## 문서 목록

| 문서 | 내용 |
|------|------|
| [01-architecture.md](./01-architecture.md) | 전체 아키텍처, 레이어 경계, 데이터 흐름 |
| [02-project-setup.md](./02-project-setup.md) | 기술스택·crate·플러그인, 프로젝트 폴더 구조, 스캐폴딩 |
| [03-sqlite-schema.md](./03-sqlite-schema.md) | SQLite 스키마 + 마이그레이션 (Postgres→SQLite) |
| [04-backend-commands.md](./04-backend-commands.md) | Rust `#[tauri::command]` API 전체 (기존 API 라우트 대응) |
| [05-coupang-rust-port.md](./05-coupang-rust-port.md) | 쿠팡 WING 모듈 Rust 포팅 (서명·클라이언트·상품) |
| [06-crawler-rust-port.md](./06-crawler-rust-port.md) | 크롤러 Rust 포팅 (셀렉터·파싱) |
| [07-frontend-plan.md](./07-frontend-plan.md) | 프론트 이식 계획, 설정/온보딩 화면, 라우팅 |
| [08-build-distribution.md](./08-build-distribution.md) | 크로스플랫폼 빌드·CI·서명·WebView2 |
| [09-milestones.md](./09-milestones.md) | 구현 순서/마일스톤 |

## 작업 원칙 (CLAUDE.md 연동)

- 구현 시 **기존 동작은 원본 코드로 재확인**하고 추측하지 않는다.
- 쿠팡 API의 알려진 함정(05 문서)을 반드시 재현한다.
