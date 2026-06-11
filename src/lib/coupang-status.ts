import { useSyncExternalStore } from "react";
import { api } from "./api";

export type ConnStatus =
  | "unknown"
  | "checking"
  | "connected"
  | "auth_failed"
  | "not_configured";

export interface ConnState {
  status: ConnStatus;
  message: string;
  checkedAt: number; // epoch ms
}

const TTL = 5 * 60 * 1000; // 5분 캐시
let state: ConnState = { status: "unknown", message: "", checkedAt: 0 };
let inflight: Promise<ConnState> | null = null;
const listeners = new Set<() => void>();

function setState(s: ConnState) {
  state = s;
  for (const l of listeners) l();
}

const isFresh = () =>
  (state.status === "connected" ||
    state.status === "auth_failed" ||
    state.status === "not_configured") &&
  Date.now() - state.checkedAt < TTL;

/**
 * 쿠팡 연결 상태 검증.
 * - 키 미설정이면 health 호출 없이 not_configured
 * - 키 있으면 coupang_health(실제 API)로 인증 확인
 * - force=false면 5분 캐시 내에선 재호출 안 함
 */
export async function verifyCoupang(force = false): Promise<ConnState> {
  if (!force && isFresh()) return state;
  if (inflight) return inflight;

  inflight = (async () => {
    setState({ ...state, status: "checking" });
    try {
      const cfg = await api.coupangGetConfig();
      if (!cfg.hasKeys || !cfg.hasVendor) {
        setState({
          status: "not_configured",
          message: !cfg.hasKeys
            ? "쿠팡 API 키가 설정되지 않았습니다."
            : "판매자 정보(vendorId 등)가 설정되지 않았습니다.",
          checkedAt: Date.now(),
        });
      } else {
        const h = await api.coupangHealth();
        setState({
          status: h.ok ? "connected" : "auth_failed",
          message: h.message,
          checkedAt: Date.now(),
        });
      }
    } catch (e) {
      setState({
        status: "auth_failed",
        message: String(e),
        checkedAt: Date.now(),
      });
    } finally {
      inflight = null;
    }
    return state;
  })();
  return inflight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function getSnapshot() {
  return state;
}

/** 컴포넌트에서 연결 상태 구독. */
export function useCoupangStatus() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
