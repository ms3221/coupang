import { useState } from "react";
import { Trash2 } from "lucide-react";

import { useLogs, clearLogs, type LogEntry } from "@/lib/log-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const fmtTime = (t: number) => {
  const d = new Date(t);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(
    d.getMilliseconds(),
    3
  )}`;
};

export default function Logs() {
  const logs = useLogs();
  const [onlyErrors, setOnlyErrors] = useState(false);
  const errorCount = logs.filter((l) => l.status === "error").length;
  const shown = onlyErrors ? logs.filter((l) => l.status === "error") : logs;

  return (
    <Card>
      <CardHeader>
          <CardTitle className="text-lg">
            IPC 로그{" "}
            <span className="font-mono text-sm font-normal text-muted-foreground">
              ({logs.length}건{errorCount > 0 ? `, 오류 ${errorCount}` : ""})
            </span>
          </CardTitle>
          <CardAction className="flex gap-2">
            <Button
              variant={onlyErrors ? "default" : "outline"}
              size="sm"
              onClick={() => setOnlyErrors((v) => !v)}
            >
              오류만
            </Button>
            <Button variant="outline" size="sm" onClick={clearLogs}>
              <Trash2 />
              비우기
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {shown.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">
              {onlyErrors
                ? "오류 로그가 없습니다."
                : "아직 IPC 호출 기록이 없습니다. 크롤/저장 등을 실행하면 여기에 쌓입니다."}
            </p>
          ) : (
            <div className="space-y-1 font-mono text-xs">
              {shown.map((l) => (
                <LogRow key={l.id} log={l} />
              ))}
            </div>
          )}
        </CardContent>
    </Card>
  );
}

function LogRow({ log }: { log: LogEntry }) {
  const [open, setOpen] = useState(false);
  const err = log.status === "error";
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        err
          ? "border-rose-500/30 bg-rose-500/10"
          : "border-border bg-secondary/30"
      )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-muted-foreground">{fmtTime(log.time)}</span>
        <Badge
          variant="outline"
          className={
            err
              ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          }
        >
          {err ? "ERR" : "OK"}
        </Badge>
        <span className="font-medium text-foreground">{log.command}</span>
        <span className="ml-auto text-muted-foreground">{log.durationMs}ms</span>
      </button>
      {err && log.error && (
        <p className="mt-1 break-all whitespace-pre-wrap text-rose-300">
          {log.error}
        </p>
      )}
      {open && log.argsPreview && (
        <p className="mt-1 break-all whitespace-pre-wrap text-muted-foreground">
          args: {log.argsPreview}
        </p>
      )}
    </div>
  );
}
