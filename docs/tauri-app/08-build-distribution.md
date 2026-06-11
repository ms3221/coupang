# 08. 빌드 / 배포 (크로스플랫폼)

대상: **macOS + Windows**. 자세한 배경은 [../legacy-moon-project/07](../legacy-moon-project/07-tauri-migration-notes.md) "크로스플랫폼 실무 메모".

## 핵심 원칙

1. **빌드는 OS별로 분리**: Mac에서 Windows 인스톨러를 못 만든다(크로스컴파일 난이도 높음).
   → **GitHub Actions CI**로 OS별 빌드 산출물을 자동 생성하는 게 표준.
2. **경로는 Tauri path API**: `app_data_dir` 등. 하드코딩 금지(Mac/Win 경로 상이).
3. **WebView2**(Windows): 인스톨러가 런타임 자동 설치/번들하도록 설정.

## 로컬 개발

```bash
npm run tauri dev      # 개발 (핫리로드)
npm run tauri build    # 현재 OS용 배포 빌드
```
- Mac에서 `tauri build` → `.app` / `.dmg`
- Windows에서 `tauri build` → `.msi` / `.exe`(NSIS)

## 산출물

| OS | 포맷 |
|----|------|
| macOS | `.app`, `.dmg` (Intel/Apple Silicon — 타깃 분리 가능) |
| Windows | `.msi`(WiX), `.exe`(NSIS) |

## GitHub Actions (권장)

`tauri-apps/tauri-action` 사용. matrix로 macOS·Windows 러너에서 각각 빌드 → 릴리스에 업로드.

```yaml
# .github/workflows/release.yml (개요)
strategy:
  matrix:
    include:
      - platform: macos-latest
      - platform: windows-latest
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
  - uses: dtolnay/rust-toolchain@stable
  - run: npm ci
  - uses: tauri-apps/tauri-action@v0   # 빌드 + 릴리스 업로드
```

> 이걸로 **윈도우 PC 없이도** 윈도우 인스톨러를 만들 수 있다.

## WebView2 (Windows)

- `tauri.conf.json`의 Windows webview 설치 모드 설정
  (예: `downloadBootstrapper` — 없으면 설치 시 자동 다운로드).
- 대부분 최신 Windows엔 이미 있음. 없는 환경 대비.

## 코드 서명 (배포 단계 과제, 초기엔 생략 가능)

| OS | 방식 | 미서명 시 |
|----|------|-----------|
| macOS | Apple Developer 인증서 + notarization | "확인되지 않은 개발자" 경고 |
| Windows | Authenticode(EV/OV) 인증서 | SmartScreen 경고 |

- 초기 내부 배포는 미서명으로도 동작(경고만). 외부 배포 시 서명 도입.

## 자동 업데이트 (선택)

- Tauri **updater 플러그인**으로 버전 체크/자동 갱신 가능.
- 업데이트 서버(정적 JSON + 산출물 호스팅)나 GitHub Releases 연동.
- DB는 `app_data_dir`에 있으므로 **앱 업데이트 후에도 데이터 유지**.
- 초기엔 수동 배포로 시작, 사용자가 늘면 도입.

## 데이터 백업 (권장 기능)

- 로컬 단일 기기라 백업이 사용자 책임 → **DB 내보내기/가져오기** 기능 제공 권장.
  - 내보내기: `data.db` 복사 또는 JSON 덤프 저장(파일 다이얼로그).
  - 가져오기: 선택 파일로 복원.
- 우선순위는 낮음(MVP 이후).
