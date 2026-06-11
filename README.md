# 쿠팡 상품 자동등록 (coupang_tauri)

한경(hankyeong.kr) HOT 6 상품을 크롤링해 쿠팡 WING API로 등록·수정·승인하는
**Tauri 데스크톱 앱**. 데이터는 앱 내장 **로컬 SQLite**에 저장한다. (서버·외부 DB·로그인 없음)

## 기술 스택

- 프론트: React 19 + Vite + Tailwind CSS v4 + React Router
- 백엔드: Rust (Tauri v2) — reqwest, hmac/sha2, scraper, rusqlite(bundled)
- DB: 로컬 SQLite (무설치, 첫 실행 시 자동 생성)
- 대상 OS: macOS + Windows

## 개발

```bash
npm install            # 의존성 설치
npm run tauri dev      # 개발 모드 (앱 실행 + 핫리로드)
npm run tauri build    # 현재 OS용 배포 빌드
npm run build          # 프론트엔드만 빌드 (타입체크 포함)
```

## 폴더 구조

```
src/            프론트엔드 (React)
  routes/       페이지 (Dashboard, Register, Edit, Settings 예정)
  lib/          api.ts(invoke 래퍼), types.ts
src-tauri/      백엔드 (Rust)
  src/          커맨드/모듈 (coupang, crawler, db, settings 예정)
  migrations/   SQLite 마이그레이션 (예정)
docs/           설계·구현 문서
  legacy-moon-project/   기존 프로젝트 분석
  tauri-app/             새 앱 설계/구현 문서
```

## 문서

- 설계/구현: [`docs/tauri-app/README.md`](docs/tauri-app/README.md)
- 기존 분석: [`docs/legacy-moon-project/README.md`](docs/legacy-moon-project/README.md)
- 작업 지침: [`CLAUDE.md`](CLAUDE.md)

## 진행 상황

- [x] M0: 스캐폴딩 (Tauri+React+Tailwind, invoke 왕복 검증)
- [x] M1: DB 레이어 (SQLite 마이그레이션 0001_init, settings 커맨드)
- [x] M2: 쿠팡 모듈 (HMAC 서명 + 단위테스트 통과, health 커맨드) ← 핵심 관문 통과
- [x] M3: 설정 화면 (키 입력 + 인증 테스트) — 실제 키 인증 확인됨
- [x] M4: 크롤러 (HOT6 파싱 회귀테스트 통과) + 스냅샷 저장/조회/삭제 + 대시보드 크롤링 UI
- [x] M5: 상품 등록 (쿠팡 products API + drafts/register 커맨드 + 등록 폼 화면)
- [x] M5+: 설정 화면 확장 (판매자정보/반품지/출고지 lookup)
- [x] M6: 승인/재승인 (승인반려→수정→재승인 자동) + 상태 동기화 + 대시보드 상품 탭
- [x] M7: 상품 수정 (편집 폼 — register 폼 재사용 + update 커맨드)
- [ ] M8: 배포 (크로스플랫폼 빌드)
