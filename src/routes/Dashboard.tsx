import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

import { api, type CrawledProduct, type CrawlItemResult } from "../lib/api";
import { SITES, siteLabel, siteBadgeCls, categoryLabel } from "../lib/sites";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { useConfirm } from "@/components/confirm-dialog";
import { cn } from "@/lib/utils";

const fmtPrice = (p: number | null) =>
  p != null ? p.toLocaleString("ko-KR") + "원" : "-";
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function Dashboard() {
  const [products, setProducts] = useState<CrawledProduct[]>([]);
  const [crawlResult, setCrawlResult] = useState<CrawlItemResult[]>([]);
  const [crawling, setCrawling] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const navigate = useNavigate();
  const confirm = useConfirm();

  const fetchProducts = useCallback(async () => {
    setListLoading(true);
    try {
      setProducts(await api.listCrawledProducts());
    } catch (e) {
      toast.error(String(e));
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // 마지막 크롤 결과: code → 상태/이전가 (테이블 상태 배지용)
  const crawlMap = useMemo(() => {
    const m = new Map<string, CrawlItemResult>();
    for (const r of crawlResult) m.set(r.code, r);
    return m;
  }, [crawlResult]);

  const handleCrawl = async (source: string) => {
    setCrawling(source);
    try {
      const res = await api.crawlSite(source);
      setCrawlResult(res);
      const n = res.filter((r) => r.status === "new").length;
      const u = res.filter((r) => r.status === "updated").length;
      toast.success(
        `${siteLabel(source)} 크롤 완료 — 신규 ${n} · 가격변동 ${u} · 전체 ${res.length}`
      );
      await fetchProducts();
    } catch (e) {
      toast.error(`크롤링 실패: ${String(e)}`);
    } finally {
      setCrawling(null);
    }
  };

  const handleRegister = async (p: CrawledProduct) => {
    try {
      const draft = await api.upsertDraft({
        productCode: p.code,
        productName: p.name,
        formData: {
          sellerProductName: p.name,
          displayProductName: p.name,
          generalProductName: p.name,
          originalPrice: String(p.originalPrice || ""),
          salePrice: String(p.salePrice || ""),
          representImage: p.image || "",
        },
      });
      navigate(`/register?draftId=${draft.id}`);
    } catch (e) {
      toast.error(`임시저장 생성 실패: ${String(e)}`);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "수집 상품 삭제",
      description: "이 상품을 수집 목록에서 삭제할까요?",
      confirmText: "삭제",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteCrawledProduct(id);
      fetchProducts();
      toast.success("삭제했습니다.");
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className="space-y-6">
          {/* 크롤 액션 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">사이트 크롤링</CardTitle>
              <CardDescription>
                등록된 사이트의 BEST/HOT 6를 수집해 상품 마스터에 자동 반영합니다
                (중복은 자동 병합)
              </CardDescription>
              <CardAction className="flex flex-wrap gap-2">
                {Object.keys(SITES).map((src) => (
                  <Button
                    key={src}
                    onClick={() => handleCrawl(src)}
                    disabled={crawling !== null}
                  >
                    {crawling === src ? (
                      <>
                        <Loader2 className="animate-spin" />
                        {siteLabel(src)}...
                      </>
                    ) : (
                      `${siteLabel(src)} 크롤`
                    )}
                  </Button>
                ))}
              </CardAction>
            </CardHeader>
            {crawlResult.length > 0 && (
              <CardContent>
                <div className="flex flex-wrap gap-2 text-xs">
                  <SummaryChip
                    label="신규"
                    n={crawlResult.filter((r) => r.status === "new").length}
                    cls="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  />
                  <SummaryChip
                    label="가격변동"
                    n={crawlResult.filter((r) => r.status === "updated").length}
                    cls="border-amber-500/30 bg-amber-500/10 text-amber-300"
                  />
                  <SummaryChip
                    label="변화없음"
                    n={crawlResult.filter((r) => r.status === "unchanged").length}
                    cls="border-border bg-muted text-muted-foreground"
                  />
                </div>
              </CardContent>
            )}
          </Card>

          {/* 수집 상품 테이블 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                수집 상품{" "}
                <span className="font-mono text-sm font-normal text-muted-foreground">
                  ({products.length}개)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {listLoading ? (
                <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  불러오는 중...
                </p>
              ) : products.length === 0 ? (
                <p className="py-12 text-center text-muted-foreground">
                  수집된 상품이 없습니다. "지금 크롤"을 눌러 시작하세요.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">순위</TableHead>
                      <TableHead>상품</TableHead>
                      <TableHead>사이트</TableHead>
                      <TableHead className="text-right">가격</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>마지막 수집</TableHead>
                      <TableHead className="text-right">액션</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p) => {
                      const r = crawlMap.get(p.code);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-muted-foreground">
                            {p.lastRank ?? "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="size-10 shrink-0 overflow-hidden rounded-md bg-secondary">
                                {p.image ? (
                                  <img
                                    src={p.image}
                                    alt=""
                                    className="size-full object-cover"
                                  />
                                ) : null}
                              </div>
                              <div className="min-w-0">
                                <p className="max-w-[280px] truncate text-sm font-medium">
                                  {p.name}
                                </p>
                                <p className="font-mono text-xs text-muted-foreground">
                                  {p.code}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={siteBadgeCls(p.source)}
                            >
                              {siteLabel(p.source)}
                            </Badge>
                            {p.category && (
                              <span className="ml-1 font-mono text-xs text-muted-foreground">
                                {categoryLabel(p.category)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="font-mono text-sm font-semibold text-primary">
                              {fmtPrice(p.salePrice)}
                            </div>
                            {p.originalPrice != null &&
                              p.originalPrice !== p.salePrice && (
                                <div className="font-mono text-xs text-muted-foreground line-through">
                                  {fmtPrice(p.originalPrice)}
                                </div>
                              )}
                          </TableCell>
                          <TableCell>
                            {r?.status === "new" && (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              >
                                NEW
                              </Badge>
                            )}
                            {r?.status === "updated" && (
                              <PriceDeltaBadge
                                prev={r.prevSalePrice}
                                now={p.salePrice}
                              />
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {fmtDate(p.lastSeenAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" onClick={() => handleRegister(p)}>
                                등록
                              </Button>
                              <Button
                                variant="destructive"
                                size="icon-sm"
                                onClick={() => handleDelete(p.id)}
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
    </div>
  );
}

function SummaryChip({
  label,
  n,
  cls,
}: {
  label: string;
  n: number;
  cls: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1",
        cls
      )}
    >
      {label} <b className="font-mono">{n}</b>
    </span>
  );
}

function PriceDeltaBadge({
  prev,
  now,
}: {
  prev: number | null;
  now: number | null;
}) {
  if (prev == null || now == null) {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/30 bg-amber-500/10 text-amber-300"
      >
        변동
      </Badge>
    );
  }
  const down = now < prev;
  return (
    <Badge
      variant="outline"
      className={
        down
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-rose-500/30 bg-rose-500/10 text-rose-300"
      }
    >
      {down ? "▼" : "▲"} {Math.abs(now - prev).toLocaleString("ko-KR")}
    </Badge>
  );
}
