# CLAUDE.md

이 파일은 이 저장소에서 작업하는 Claude Code에 대한 지침이다.

## 🚨 중요 지시사항 (최우선)

> **추측하지 말고 항상 코드를 직접 보고 작업할 것.**

- 어떤 동작·구조·필드·API 스펙을 설명하거나 코드를 작성하기 전에, **반드시 관련 파일을
  먼저 읽어서 사실을 확인**한다. 기억이나 추정에 의존하지 않는다.
- "아마 이럴 것이다", "보통 이렇게 한다" 식으로 넘어가지 않는다. 근거가 되는
  **파일 경로와 라인**을 확인하고 인용한다.
- 기존 코드(원본 `moon_project` 포함)의 동작이 궁금하면 **직접 열어서 확인**한 뒤 답한다.
- 문서(`docs/`)의 내용도 코드에서 추론한 것이므로, 구현에 영향이 큰 부분은
  **원본 코드로 재검증**한 후 사용한다.
- 불확실하면 추측해서 진행하지 말고 **사용자에게 묻거나, 코드를 더 읽어** 확실히 한 뒤 진행한다.

## 프로젝트 개요

이 저장소(`coupang_tauri`)는 기존 **moon_project**(Next.js + Supabase)의 **쿠팡 셀러
자동등록 어드민**을 **Tauri 데스크톱 앱**으로 재구현하기 위한 프로젝트다.

- 한경(hankyeong.kr) "시골농부 HOT 6" 상품 크롤링 → 쿠팡 WING API 등록·수정·승인 관리
- 대상: 운영자 1인용 로컬 도구
- 현재 단계: **조사·문서화 완료, 구현 시작 전.** (Tauri 스캐폴딩 아직 없음)

## 참조 문서 (`docs/`)

작업 전 관련 문서를 먼저 읽되, 위 지시사항대로 핵심은 원본 코드로 재확인한다.

> **문서 폴더 규칙**: `docs/legacy-moon-project/`는 **기존 프로젝트(moon_project) 분석 전용**이다.
> 앞으로 만들 **새 Tauri 프로젝트의 설계·구현 문서는 이 폴더에 넣지 말고 `docs/` 하위의 별도
> 폴더**에 정리한다. 기존 분석과 새 문서를 섞지 않는다.

기존 프로젝트 분석 문서 (`docs/legacy-moon-project/`):

| 문서 | 내용 |
|------|------|
| `README.md` | 분석 문서 인덱스 |
| `01-overview.md` | 시스템 개요, 기술스택, 환경변수 |
| `02-admin-architecture.md` | 어드민 라우팅/인증, 페이지·API 맵 |
| `03-coupang-api.md` | 쿠팡 WING API (HMAC 서명, 엔드포인트, 함정) |
| `04-data-model.md` | Supabase 테이블, 상태 머신 |
| `05-flows.md` | 크롤링/등록/승인/수정 플로우 |
| `06-product-form-reference.md` | 상품등록 폼 + 요청 JSON 전체 레퍼런스 |
| `07-tauri-migration-notes.md` | 전환 배경·확정 결정·SQLite 동작 방식 |

새 Tauri 앱 구현 문서 (`docs/tauri-app/`):

| 문서 | 내용 |
|------|------|
| `README.md` | 구현 문서 인덱스 + 확정 결정 요약 |
| `01-architecture.md` | 아키텍처, 레이어, 데이터 흐름 |
| `02-project-setup.md` | 기술스택·crate, 폴더 구조, 스캐폴딩 |
| `03-sqlite-schema.md` | SQLite 스키마 + 마이그레이션 |
| `04-backend-commands.md` | Rust 커맨드 API (기존 라우트 대응) |
| `05-coupang-rust-port.md` | 쿠팡 모듈 Rust 포팅 + 함정 체크리스트 |
| `06-crawler-rust-port.md` | 크롤러 Rust 포팅 |
| `07-frontend-plan.md` | 프론트 이식, 설정/온보딩 화면 |
| `08-build-distribution.md` | 크로스플랫폼 빌드·CI·서명 |
| `09-milestones.md` | 구현 순서/마일스톤 |

## 원본 코드 위치

```
/Users/anhyeongjun/Desktop/개인 공부/moon_project
```

재구현 중 동작 확인이 필요하면 위 원본을 직접 열어 확인한다. 특히:
- 쿠팡 연동 로직: `src/lib/coupang/*` (서명·클라이언트·상품 API)
- 크롤러: `src/lib/crawler.ts`
- 어드민 API: `src/app/api/admin/**`
- 등록 폼: `src/app/admin/register/page.tsx`

## 작업 원칙

- 변경/구현 전 영향 범위의 파일을 읽는다.
- 쿠팡 API의 알려진 함정(03·07 문서)을 반드시 재현한다:
  HTTP 200 + `code:"ERROR"`, `data`가 숫자, contents 생성/수정 형식 차이, UTC 서명 datetime,
  등록/수정 후 대기 조회.
- 미확정 설계 결정(07 문서의 열린 질문)은 임의로 정하지 말고 사용자와 합의한다.
