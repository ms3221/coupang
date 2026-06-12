import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

import { getVersion } from "@tauri-apps/api/app";

import { api } from "../lib/api";
import { useCoupangStatus, verifyCoupang } from "@/lib/coupang-status";
import { checkForUpdate } from "@/lib/updater";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

// settings 테이블 db 키 (백엔드 coupang_get_config 와 일치)
const K = {
  accessKey: "coupang_access_key",
  secretKey: "coupang_secret_key",
  vendorId: "coupang_vendor_id",
  vendorUserId: "coupang_vendor_user_id",
  returnCenterCode: "coupang_return_center_code",
  returnChargeName: "coupang_return_charge_name",
  companyContactNumber: "coupang_company_contact_number",
  returnZipCode: "coupang_return_zip_code",
  returnAddress: "coupang_return_address",
  returnAddressDetail: "coupang_return_address_detail",
  outboundShippingPlaceCode: "coupang_outbound_shipping_place_code",
  afterServiceInformation: "coupang_after_service_information",
  afterServiceContactNumber: "coupang_after_service_contact_number",
} as const;

const ALL_KEYS = Object.values(K);

export default function Settings() {
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupData, setLookupData] = useState<any>(null);
  const [appVersion, setAppVersion] = useState("");
  const conn = useCoupangStatus();

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const get = (k: string) => form[k] ?? "";
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        const init: Record<string, string> = {};
        for (const k of ALL_KEYS) init[k] = s[k] ?? "";
        setForm(init);
      })
      .finally(() => setLoading(false));
  }, []);

  const persist = async () => {
    const entries: Record<string, string> = {};
    for (const k of ALL_KEYS) entries[k] = (form[k] ?? "").trim();
    await api.saveSettings(entries);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await persist();
      toast.success("저장되었습니다.");
      verifyCoupang(true); // 키 변경 가능성 → 재검증 (헤더 인디케이터 갱신)
    } catch (e) {
      toast.error(`저장 실패: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleHealth = async () => {
    try {
      await persist();
      const r = await verifyCoupang(true);
      r.status === "connected"
        ? toast.success(r.message || "인증 성공")
        : toast.error(r.message || "인증 실패");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleLookup = async () => {
    setLookupLoading(true);
    setLookupData(null);
    try {
      await persist(); // vendorId 등 저장 후 조회
      setLookupData(await api.coupangLookup());
    } catch (e) {
      toast.error(`조회 실패: ${String(e)}`);
    } finally {
      setLookupLoading(false);
    }
  };

  const applyReturnCenter = (c: any) => {
    set(K.returnCenterCode, String(c.returnCenterCode || ""));
    set(K.returnChargeName, c.shippingPlaceName || c.returnChargeName || "");
    set(K.companyContactNumber, c.placeAddresses?.[0]?.companyContactNumber || c.companyContactNumber || "");
    set(K.returnZipCode, c.placeAddresses?.[0]?.returnZipCode || c.returnZipCode || "");
    set(K.returnAddress, c.placeAddresses?.[0]?.returnAddress || c.returnAddress || "");
    set(K.returnAddressDetail, c.placeAddresses?.[0]?.returnAddressDetail || c.returnAddressDetail || "");
    toast.success("반품지를 적용했습니다. 저장을 눌러주세요.");
  };
  const applyShippingPlace = (p: any) => {
    set(K.outboundShippingPlaceCode, String(p.outboundShippingPlaceCode || ""));
    toast.success("출고지를 적용했습니다. 저장을 눌러주세요.");
  };

  const returnCenters = lookupData?.returnCenters?.data?.content as any[] | undefined;
  const shippingPlaces = (lookupData?.shippingPlaces?.content ||
    lookupData?.shippingPlaces?.data?.content) as any[] | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">설정</h1>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="animate-spin" />
                저장 중...
              </>
            ) : (
              "전체 저장"
            )}
          </Button>
        </div>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            불러오는 중...
          </p>
        ) : (
          <>
            {/* API 키 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">쿠팡 API 키</CardTitle>
                <CardDescription>
                  쿠팡 WING에서 발급받은 키. 이 기기에만 저장됩니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Access Key">
                  <Input
                    value={get(K.accessKey)}
                    onChange={(e) => set(K.accessKey, e.target.value)}
                    placeholder="COUPANG_ACCESS_KEY"
                  />
                </Field>
                <Field label="Secret Key">
                  <Input
                    type="password"
                    value={get(K.secretKey)}
                    onChange={(e) => set(K.secretKey, e.target.value)}
                    placeholder="COUPANG_SECRET_KEY"
                  />
                </Field>
                <div className="flex items-center gap-3 pt-1">
                  <Button
                    variant="outline"
                    onClick={handleHealth}
                    disabled={
                      conn.status === "checking" ||
                      !get(K.accessKey) ||
                      !get(K.secretKey)
                    }
                  >
                    {conn.status === "checking" ? (
                      <>
                        <Loader2 className="animate-spin" />
                        확인 중...
                      </>
                    ) : (
                      "API 인증 테스트"
                    )}
                  </Button>
                  {(conn.status === "connected" ||
                    conn.status === "auth_failed") && (
                    <span
                      className={cn(
                        "flex items-center gap-1 text-sm",
                        conn.status === "connected"
                          ? "text-emerald-400"
                          : "text-rose-400"
                      )}
                    >
                      {conn.status === "connected" ? (
                        <CheckCircle2 className="size-4" />
                      ) : (
                        <XCircle className="size-4" />
                      )}
                      {conn.message}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 판매자 정보 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">판매자 정보</CardTitle>
                <CardDescription>
                  vendorId는 반품지/출고지 조회에 필요합니다.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Vendor ID (판매자 ID)">
                    <Input value={get(K.vendorId)} onChange={(e) => set(K.vendorId, e.target.value)} placeholder="A00012345" />
                  </Field>
                  <Field label="Vendor User ID">
                    <Input value={get(K.vendorUserId)} onChange={(e) => set(K.vendorUserId, e.target.value)} />
                  </Field>
                  <Field label="A/S 정보">
                    <Input value={get(K.afterServiceInformation)} onChange={(e) => set(K.afterServiceInformation, e.target.value)} placeholder="기본: 판매자 문의" />
                  </Field>
                  <Field label="A/S 연락처">
                    <Input value={get(K.afterServiceContactNumber)} onChange={(e) => set(K.afterServiceContactNumber, e.target.value)} />
                  </Field>
                </div>
              </CardContent>
            </Card>

            {/* 반품/출고지 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">반품 / 출고지</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button variant="outline" onClick={handleLookup} disabled={lookupLoading}>
                  {lookupLoading ? (
                    <>
                      <Loader2 className="animate-spin" />
                      조회 중...
                    </>
                  ) : (
                    "쿠팡에서 반품지/출고지 불러오기"
                  )}
                </Button>

                {returnCenters && returnCenters.length > 0 && (
                  <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-4">
                    <p className="mb-1 text-sm font-medium text-primary">
                      반품지 (클릭하여 적용)
                    </p>
                    {returnCenters.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => applyReturnCenter(c)}
                        className="w-full rounded-md border border-border bg-card p-3 text-left text-sm transition-colors hover:bg-secondary"
                      >
                        <span className="font-medium">
                          {c.shippingPlaceName || c.returnChargeName || `반품지 ${i + 1}`}
                        </span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          코드: {c.returnCenterCode}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {shippingPlaces && shippingPlaces.length > 0 && (
                  <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-4">
                    <p className="mb-1 text-sm font-medium text-primary">
                      출고지 (클릭하여 적용)
                    </p>
                    {shippingPlaces.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => applyShippingPlace(p)}
                        className="w-full rounded-md border border-border bg-card p-3 text-left text-sm transition-colors hover:bg-secondary"
                      >
                        <span className="font-medium">
                          {p.shippingPlaceName || `출고지 ${i + 1}`}
                        </span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          코드: {p.outboundShippingPlaceCode}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {lookupData?.errors?.returnCenters && (
                  <p className="text-sm text-rose-400">
                    반품지 조회 실패: {lookupData.errors.returnCenters}
                  </p>
                )}
                {lookupData?.errors?.shippingPlaces && (
                  <p className="text-sm text-rose-400">
                    출고지 조회 실패: {lookupData.errors.shippingPlaces}
                  </p>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="반품지 센터코드"><Input value={get(K.returnCenterCode)} onChange={(e) => set(K.returnCenterCode, e.target.value)} /></Field>
                  <Field label="반품지명"><Input value={get(K.returnChargeName)} onChange={(e) => set(K.returnChargeName, e.target.value)} /></Field>
                  <Field label="연락처"><Input value={get(K.companyContactNumber)} onChange={(e) => set(K.companyContactNumber, e.target.value)} placeholder="02-XXXX-XXXX" /></Field>
                  <Field label="반품지 우편번호"><Input value={get(K.returnZipCode)} onChange={(e) => set(K.returnZipCode, e.target.value)} /></Field>
                  <Field label="반품지 주소"><Input value={get(K.returnAddress)} onChange={(e) => set(K.returnAddress, e.target.value)} /></Field>
                  <Field label="반품지 상세주소"><Input value={get(K.returnAddressDetail)} onChange={(e) => set(K.returnAddressDetail, e.target.value)} /></Field>
                  <Field label="출고지 주소코드"><Input value={get(K.outboundShippingPlaceCode)} onChange={(e) => set(K.outboundShippingPlaceCode, e.target.value)} /></Field>
                </div>
              </CardContent>
            </Card>

            {/* 정보 / 업데이트 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">정보</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">
                  Coupilot 버전{" "}
                  <span className="font-mono text-foreground">
                    {appVersion || "—"}
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => checkForUpdate(false)}
                >
                  업데이트 확인
                </Button>
              </CardContent>
            </Card>

            <div className="flex justify-end pb-8">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="animate-spin" />
                    저장 중...
                  </>
                ) : (
                  "전체 저장"
                )}
              </Button>
            </div>
          </>
        )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
