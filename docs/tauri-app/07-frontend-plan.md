# 07. 프론트엔드 이식 계획

기존 React 컴포넌트를 **재사용**하되, Next.js 특화 부분만 교체. (결정: 재사용 후 개선)

## 교체 매핑

| Next.js | Tauri(React+Vite) |
|---------|-------------------|
| App Router (`app/`) | React Router (`routes/`) |
| `app/admin/page.tsx` | `routes/Dashboard.tsx` |
| `app/admin/register/page.tsx` | `routes/Register.tsx` |
| `app/admin/edit/page.tsx` | `routes/Edit.tsx` |
| `app/admin/login/page.tsx` | **삭제** (로그인 제거) |
| (신규) | `routes/Settings.tsx` (쿠팡 키/셀러정보 입력) |
| `fetch("/api/admin/...")` | `invoke("command", {...})` (`lib/api.ts`) |
| `useSearchParams`/`useRouter` (next) | `useSearchParams`/`useNavigate` (react-router) |
| `next/navigation` | `react-router-dom` |
| Server Component / 미들웨어 | 없음 (전부 클라이언트) |
| Tailwind 설정 | 거의 그대로 (PostCSS 설정만 Vite에 맞게) |

> 마크업·Tailwind 클래스·폼 상태 로직(useState 등)은 대부분 **그대로 복붙 후 import만 수정**.

## 라우팅 (`App.tsx`)

```tsx
<BrowserRouter>            {/* 또는 HashRouter (파일 프로토콜 안전) */}
  <Routes>
    <Route path="/" element={<Dashboard />} />
    <Route path="/register" element={<Register />} />
    <Route path="/edit" element={<Edit />} />
    <Route path="/settings" element={<Settings />} />
  </Routes>
</BrowserRouter>
```

> Tauri 로컬 환경에선 `HashRouter`가 새로고침/딥링크에 안전할 수 있음(검토).

## 데이터 호출 패턴 변경

기존:
```ts
const res = await fetch("/api/admin/coupang/register", { method:"POST", body: JSON.stringify(x) });
const data = await res.json();
if (res.ok) { ... } else { setError(data.error); }
```
신규:
```ts
import { api } from "@/lib/api";
try {
  const data = await api.registerProduct(product, draftId);
  // 성공
} catch (e) {
  setError(String(e));   // Rust AppError 메시지
}
```

→ HTTP status 분기 대신 **try/catch**. 에러는 Rust `AppError`의 메시지 문자열.

## 신규: 설정/온보딩 화면 (`Settings.tsx`)

로그인을 대체하는 **첫 실행 설정**. 입력값은 `save_settings`/`coupang_save_config`로 로컬 저장.

입력 항목:
- 쿠팡 **Access Key / Secret Key** (필수) — 기존 env 대체
- vendorId / vendorUserId
- 반품지(센터코드/이름/연락처/우편번호/주소/상세주소)
- 출고지 주소코드
- A/S 정보/연락처

동작:
- `[API 인증 테스트]` → `coupang_health`
- `[쿠팡에서 반품지/출고지 불러오기]` → `coupang_lookup` (기존 register 폼의 lookup 재사용)
- 앱 시작 시 `coupang_get_config.ready == false` 면 → 설정 화면으로 유도(배너 or 리다이렉트)

## 폼 재사용 메모 (register/edit)

- `collectFormData`/`restoreFormData`(draft 직렬화) 그대로 사용.
- 제출 시 쿠팡 요청 본문 조립 로직(06 legacy 문서)도 그대로. 단, **프론트에서 조립한 객체를
  `invoke`로 넘기고 최종 검증/전송은 Rust**가 하도록 경계만 명확히.
- 숫자 변환·고정값(requested=false 등)은 프론트/백 어디서 할지 한 곳으로 통일(권장: Rust에서 최종 정규화).

## 타입 공유 (`lib/types.ts`)

Rust struct(`coupang/types.rs`)와 1:1 미러링되는 TS interface 유지. 필드명 camelCase 통일.
직렬화 경계(`invoke` 인자/반환)에서 어긋나지 않도록 관리.
