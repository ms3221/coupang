import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Pencil, Trash2, RefreshCw } from "lucide-react";

import { api, type Draft, type RegisteredProduct } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { useConfirm } from "@/components/confirm-dialog";
import { cn } from "@/lib/utils";

/** 상태 → 라벨 + HUD 톤 색 (채도 낮춘 Tailwind 팔레트). */
const STATUS_CONF: Record<string, { label: string; cls: string }> = {
  registered: { label: "등록완료", cls: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  approved: { label: "승인완료", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  rejected: { label: "승인반려", cls: "border-rose-500/30 bg-rose-500/10 text-rose-300" },
  deleted: { label: "삭제됨", cls: "border-border bg-muted text-muted-foreground" },
};
const TEMP_CLS = "border-amber-500/30 bg-amber-500/10 text-amber-300";
const COUPANG_CLS = "border-violet-500/30 bg-violet-500/10 text-violet-300";

const COUNT_CARDS = [
  { key: "draft", label: "임시저장", cls: "text-amber-300" },
  { key: "registered", label: "등록완료", cls: "text-sky-300" },
  { key: "approved", label: "승인완료", cls: "text-emerald-300" },
  { key: "rejected", label: "승인반려", cls: "text-rose-300" },
] as const;

export default function ProductsTab() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [products, setProducts] = useState<RegisteredProduct[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const setItemBusy = (id: string, on: boolean) =>
    setBusy((prev) => {
      const n = new Set(prev);
      on ? n.add(id) : n.delete(id);
      return n;
    });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, d] = await Promise.all([
        api.listRegisteredProducts(),
        api.listDrafts(),
      ]);
      setProducts(p);
      // 임시저장 + 등록실패(failed) 둘 다 표시 — failed가 UI에서 증발하지 않게
      setDrafts(d.filter((x) => x.status === "draft" || x.status === "failed"));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleApprove = async (p: RegisteredProduct) => {
    if (!p.sellerProductId) return;
    setItemBusy(p.id, true);
    try {
      const data = await api.coupangApproveProduct(p.sellerProductId);
      toast.success(data.message);
      await fetchAll();
    } catch (e) {
      toast.error(`승인 실패: ${String(e)}`);
    } finally {
      setItemBusy(p.id, false);
    }
  };

  const handleSyncAll = async () => {
    const targets = products.filter((p) => p.sellerProductId);
    if (targets.length === 0) {
      toast.warning("동기화할 상품이 없습니다.");
      return;
    }
    setSyncing(true);
    try {
      await Promise.all(
        targets.map((p) => api.coupangSyncProduct(p.sellerProductId!, p.id))
      );
      await fetchAll();
      toast.success(`${targets.length}개 상품 상태를 동기화했습니다.`);
    } catch (e) {
      toast.error(`동기화 실패: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteDraft = async (id: string) => {
    const ok = await confirm({
      title: "임시저장 삭제",
      description: "이 임시저장을 삭제할까요?",
      confirmText: "삭제",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      toast.success("임시저장을 삭제했습니다.");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const counts = {
    draft: drafts.length,
    registered: products.filter((p) => p.status === "registered").length,
    approved: products.filter((p) => p.status === "approved").length,
    rejected: products.filter((p) => p.status === "rejected").length,
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-6">
      {/* 카운트 카드 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {COUNT_CARDS.map(({ key, label, cls }) => (
          <Card key={key} size="sm">
            <CardContent>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={cn("mt-1 font-mono text-3xl font-bold", cls)}>
                {counts[key]}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 등록된 상품 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            등록된 상품{" "}
            <span className="font-mono text-sm font-normal text-muted-foreground">
              ({products.length}개)
            </span>
          </CardTitle>
          <CardAction className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncAll}
              disabled={syncing}
            >
              {syncing ? (
                <>
                  <Loader2 className="animate-spin" />
                  동기화 중...
                </>
              ) : (
                <>
                  <RefreshCw />
                  상태 동기화
                </>
              )}
            </Button>
            <Button size="sm" onClick={() => navigate("/register")}>
              + 새 상품 등록
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              불러오는 중...
            </p>
          ) : products.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">
              등록된 상품이 없습니다.
            </p>
          ) : (
            <div className="space-y-2">
              {products.map((p) => {
                const isTemp = p.coupangStatus === "임시저장";
                const st = isTemp
                  ? { label: "임시저장", cls: TEMP_CLS }
                  : STATUS_CONF[p.status] || STATUS_CONF.registered;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 p-4 transition-colors hover:bg-secondary"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Badge variant="outline" className={st.cls}>
                        {st.label}
                      </Badge>
                      {p.coupangStatus && (
                        <Badge variant="outline" className={COUPANG_CLS}>
                          {p.coupangStatus}
                        </Badge>
                      )}
                      <span className="truncate text-sm font-medium">
                        {p.productName || "(이름 없음)"}
                      </span>
                      <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                        ID: {p.sellerProductId}
                      </span>
                      {p.salePrice && (
                        <span className="whitespace-nowrap font-mono text-xs text-primary">
                          {p.salePrice.toLocaleString("ko-KR")}원
                        </span>
                      )}
                      <span className="ml-auto mr-2 whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {formatDate(p.updatedAt || p.registeredAt)}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/register?editId=${p.id}`)}
                      >
                        <Pencil />
                        편집
                      </Button>
                      {(p.status === "registered" || p.status === "rejected") && (
                        <Button
                          size="sm"
                          variant={p.status === "rejected" ? "outline" : "default"}
                          onClick={() => handleApprove(p)}
                          disabled={busy.has(p.id)}
                          className={
                            p.status === "rejected"
                              ? "border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                              : undefined
                          }
                        >
                          {busy.has(p.id) ? (
                            <>
                              <Loader2 className="animate-spin" />
                              처리중...
                            </>
                          ) : p.status === "rejected" ? (
                            "재승인 요청"
                          ) : (
                            "승인 요청"
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 임시저장 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            임시저장{" "}
            <span className="font-mono text-sm font-normal text-muted-foreground">
              ({drafts.length}개)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {drafts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              임시저장된 상품이 없습니다.
            </p>
          ) : (
            <div className="space-y-2">
              {drafts.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 p-4 transition-colors hover:bg-secondary"
                >
                  <div
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
                    onClick={() => navigate(`/register?draftId=${d.id}`)}
                  >
                    {d.status === "failed" ? (
                      <Badge
                        variant="outline"
                        className="border-rose-500/30 bg-rose-500/10 text-rose-300"
                      >
                        등록실패
                      </Badge>
                    ) : (
                      <Badge variant="outline" className={TEMP_CLS}>
                        임시저장
                      </Badge>
                    )}
                    <span className="truncate text-sm font-medium">
                      {d.productName || "(이름 없음)"}
                    </span>
                    <span className="ml-auto mr-2 whitespace-nowrap font-mono text-xs text-muted-foreground">
                      {formatDate(d.updatedAt)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/register?draftId=${d.id}`)}
                    >
                      <Pencil />
                      편집
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon-sm"
                      onClick={() => handleDeleteDraft(d.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
