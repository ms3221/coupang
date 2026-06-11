# 09. 구현 마일스톤

권장 구현 순서. 각 단계는 "동작 검증 가능한 산출물"을 목표로 한다.

## M0. 스캐폴딩
- [ ] `npm create tauri-app` (Tauri v2 + React + TS + Vite)
- [ ] Tailwind 설정 이식
- [ ] Rust 의존성 추가 (reqwest, hmac, sha2, hex, chrono, scraper, serde, serde_json, uuid, rusqlite, thiserror)
- [ ] `app_data_dir` 경로 확인용 더미 커맨드 1개 + 프론트에서 `invoke` 성공 확인
- **검증**: 앱이 뜨고 invoke 왕복이 된다.

## M1. DB 레이어
- [ ] `migrations/0001_init.sql` 작성 (03 문서)
- [ ] `db.rs`: `app_data_dir/coupang_tauri/data.db` 열기 + `user_version` 마이그레이션 + `PRAGMA foreign_keys`
- [ ] `settings.rs`: get/set 커맨드
- **검증**: 첫 실행 시 DB 파일 자동 생성, 테이블 존재, 설정 저장/조회 동작.

## M2. 쿠팡 모듈 (인증부터)
- [ ] `coupang/auth.rs` 서명 + **서명 일치 단위 테스트**(기존 고정 datetime 값과 비교)
- [ ] `coupang/client.rs` request<T> + 이중 에러 처리(`code:"ERROR"`)
- [ ] `coupang_health` 커맨드
- [ ] `Settings.tsx`에서 키 입력 → 인증 테스트 OK 확인
- **검증**: 실제 키로 `coupang_health` 성공. (가장 중요한 관문)

## M3. 셀러 설정 + lookup
- [ ] `coupang_get_config`/`coupang_save_config`
- [ ] `coupang_lookup` (반품지/출고지)
- [ ] 설정 화면에서 lookup→적용→저장
- **검증**: 반품지/출고지 코드가 settings에 저장됨.

## M4. 크롤링
- [ ] `crawler.rs` `crawl_hot6` + `crawl_product_detail`
- [ ] `crawl_hot6`/`save_snapshot`/`list_snapshots`/`delete_snapshot` 커맨드 (하루 1스냅샷 정책)
- [ ] `Dashboard.tsx` 크롤링 탭 이식
- **검증**: 크롤링→미리보기→저장→히스토리 표시.

## M5. 상품 등록
- [ ] `coupang/products.rs` create/get + types
- [ ] drafts 커맨드(`list/get/upsert/delete_draft`)
- [ ] `coupang_register_product` (5초 대기, sellerProductId 분기, registered_products INSERT)
- [ ] `Register.tsx` 이식 (폼 + AI추천 + 메타 불러오기 + 제출)
- **검증**: 실제 상품 1건 등록 성공, registered_products에 기록.

## M6. 승인 / 재승인
- [ ] `approve_product`/`update_product` (products.rs)
- [ ] `coupang_approve_product` (승인반려→수정→재승인 분기, contents 형식 변환)
- [ ] 대시보드 상품 탭 + 승인 버튼
- **검증**: 승인 요청, 승인반려 케이스 재승인 동작.

## M7. 수정 / 동기화
- [ ] `coupang_update_product` (contents 변환 + item ID 주입)
- [ ] `coupang_sync_product` + 대시보드 "상태 동기화"
- [ ] `Edit.tsx` 이식
- **검증**: 등록상품 수정 반영, 상태 동기화로 쿠팡 statusName 갱신.

## M8. 마감 / 배포 준비
- [ ] 에러 메시지·로딩 상태 정리
- [ ] (선택) DB 내보내기/가져오기
- [ ] GitHub Actions 빌드 (macOS + Windows)
- [ ] WebView2 설치 모드 확인
- **검증**: 양 OS 인스톨러 산출, 클린 환경 설치→첫 실행 동작.

## 우선순위 핵심 관문
> **M2(서명·health)** 가 가장 중요. 여기서 막히면 나머지가 의미 없다.
> 서명이 기존 TS와 1바이트라도 다르면 전부 인증 실패하므로, **단위 테스트로 먼저 못박을 것.**

## 진행 중 지켜야 할 것 (CLAUDE.md)
- 기존 동작은 원본(`개인 공부/moon_project`) 코드로 재확인, 추측 금지.
- 05 문서의 "재현할 함정" 체크리스트를 각 단계에서 점검.
