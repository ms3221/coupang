import { useSyncExternalStore } from "react";

export interface LogEntry {
  id: number;
  time: number; // epoch ms
  command: string;
  argsPreview?: string;
  status: "ok" | "error";
  durationMs: number;
  error?: string;
}

const MAX = 500;
let logs: LogEntry[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** 민감 키(secret/password/access key) 값은 마스킹. */
function maskSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSecrets);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/secret|password|access[_-]?key/i.test(k)) out[k] = "***";
      else out[k] = maskSecrets(v);
    }
    return out;
  }
  return value;
}

function previewArgs(args: unknown): string | undefined {
  if (args == null) return undefined;
  try {
    const s = JSON.stringify(maskSecrets(args));
    if (!s) return undefined;
    return s.length > 2000 ? s.slice(0, 2000) + "…" : s;
  } catch {
    return String(args);
  }
}

/** IPC 호출 1건 기록 (api.ts의 invoke 래퍼에서 호출). */
export function logIpc(e: {
  command: string;
  args?: unknown;
  status: "ok" | "error";
  durationMs: number;
  error?: string;
}) {
  const entry: LogEntry = {
    id: ++seq,
    time: Date.now(),
    command: e.command,
    argsPreview: previewArgs(e.args),
    status: e.status,
    durationMs: Math.round(e.durationMs),
    error: e.error,
  };
  logs = [entry, ...logs].slice(0, MAX);
  emit();
}

export function clearLogs() {
  logs = [];
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return logs;
}

/** 컴포넌트에서 로그 목록 구독. */
export function useLogs() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
