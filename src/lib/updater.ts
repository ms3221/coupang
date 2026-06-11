import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";

/**
 * 업데이트 확인. 새 버전이 있으면 toast로 알리고, 누르면 다운로드·설치·재시작.
 * @param silent true면 "최신"·실패 메시지를 띄우지 않음 (앱 시작 시 자동 체크용).
 *   dev 모드나 endpoint 미설정 시 check()가 실패하는데, 그건 조용히 무시.
 */
export async function checkForUpdate(silent = true) {
  try {
    const update = await check();
    if (!update) {
      if (!silent) toast.success("이미 최신 버전입니다.");
      return;
    }

    toast.info(`새 버전 ${update.version} 사용 가능`, {
      description: update.body || undefined,
      duration: Infinity,
      action: {
        label: "업데이트",
        onClick: async () => {
          const id = toast.loading("업데이트 다운로드 중...");
          try {
            await update.downloadAndInstall();
            toast.dismiss(id);
            toast.success("설치 완료 — 앱을 재시작합니다.");
            await relaunch();
          } catch (e) {
            toast.dismiss(id);
            toast.error(`업데이트 실패: ${String(e)}`);
          }
        },
      },
    });
  } catch (e) {
    if (!silent) toast.error(`업데이트 확인 실패: ${String(e)}`);
    // silent: dev/endpoint 미설정 에러는 무시
  }
}
