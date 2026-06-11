# 기존 프로젝트 분석 (legacy: moon_project)

이 폴더는 **기존 프로젝트(moon_project)를 파악한 결과**만 모아둔 곳입니다.
(Next.js 기반 카페 사이트 + 쿠팡 셀러 자동등록 어드민)

> 📌 이 폴더(`docs/legacy-moon-project/`)는 **기존 코드 분석 전용**입니다.
> 앞으로 만들 **새 Tauri 프로젝트의 설계·구현 문서는 이 폴더가 아니라 `docs/` 하위의
> 별도 폴더**에 정리합니다. 둘을 섞지 않습니다.

앞으로 이 어드민 기능을 **Tauri 데스크톱 앱**으로 재구현할 때 레퍼런스로 사용합니다.

> ⚠️ 원본 위치: `/Users/anhyeongjun/Desktop/개인 공부/moon_project`
> 이 문서는 2026-06-11 기준 코드를 읽고 정리한 것입니다.

## 문서 목록

| 파일 | 내용 |
|------|------|
| [01-overview.md](./01-overview.md) | 시스템 전체 개요, 목적, 기술 스택 |
| [02-admin-architecture.md](./02-admin-architecture.md) | 어드민 라우팅 구조, 인증/미들웨어, 페이지·API 맵 |
| [03-coupang-api.md](./03-coupang-api.md) | 쿠팡 WING API 연동 (HMAC 서명, 엔드포인트, 클라이언트) |
| [04-data-model.md](./04-data-model.md) | Supabase 테이블, 상태 머신, 설정값 |
| [05-flows.md](./05-flows.md) | 크롤링 / 상품등록 / 승인 / 수정 플로우 |
| [06-product-form-reference.md](./06-product-form-reference.md) | 상품등록 폼 전체 필드 레퍼런스 + 요청 JSON 구조 |
| [07-tauri-migration-notes.md](./07-tauri-migration-notes.md) | Tauri 재구현 시 고려사항 (초안) |

## 한 줄 요약

> **한경(hankyeong.kr) "시골농부 HOT 6" 상품을 크롤링 → 쿠팡 WING API로 셀러 상품 등록·수정·승인까지 관리하는 1인용 어드민 도구.**
> 현재는 Next.js + Supabase 웹앱이며, 이를 Tauri 로컬 데스크톱 앱으로 옮기려는 것이 목표.
