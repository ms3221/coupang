import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ArrowLeft, AlertTriangle, X } from "lucide-react";

import { api } from "../lib/api";
import { useCoupangStatus, verifyCoupang } from "@/lib/coupang-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AttributeRow {
  id: string;
  attributeTypeName: string;
  attributeValueName: string;
  mandatory?: boolean; // 카테고리 메타의 필수(MANDATORY) 속성 여부
}
interface NoticeRow {
  id: string;
  noticeCategoryName: string;
  noticeCategoryDetailName: string;
  content: string;
}
interface ContentRow {
  id: string;
  contentType: "TEXT" | "IMAGE";
  content: string;
}

// native <select> 공통 스타일 (shadcn Input 톤)
const selectCls =
  "flex h-9 w-full rounded-md border border-input bg-input/40 px-3 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

// 제출 검증 스키마 (흩어진 alert를 한 곳으로)
const registerSchema = z.object({
  sellerProductName: z.string().trim().min(1, "등록상품명을 입력하세요."),
  displayCategoryCode: z
    .string()
    .trim()
    .min(1, "카테고리 코드를 입력하세요.")
    .regex(/^\d+$/, "카테고리 코드는 숫자여야 합니다."),
  salePrice: z
    .string()
    .trim()
    .min(1, "판매가격을 입력하세요.")
    .regex(/^\d+$/, "판매가격은 숫자만 입력하세요."),
  representImage: z.string().trim().min(1, "대표이미지 URL을 입력하세요."),
});

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export default function Register() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // 기본 정보
  const [sellerProductName, setSellerProductName] = useState("");
  const [displayProductName, setDisplayProductName] = useState("");
  const [brand, setBrand] = useState("");
  const [generalProductName, setGeneralProductName] = useState("");
  const [displayCategoryCode, setDisplayCategoryCode] = useState("");
  const [productGroup, setProductGroup] = useState("");

  // 가격/재고
  const [originalPrice, setOriginalPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [maximumBuyCount, setMaximumBuyCount] = useState("999");
  const [maximumBuyForPerson, setMaximumBuyForPerson] = useState("0");
  const [outboundShippingTimeDay, setOutboundShippingTimeDay] = useState("2");
  const [searchTags, setSearchTags] = useState<string[]>([]);

  // 배송
  const [deliveryMethod, setDeliveryMethod] = useState("SEQUENCIAL");
  const [deliveryCompanyCode, setDeliveryCompanyCode] = useState("KGB");
  const [deliveryChargeType, setDeliveryChargeType] = useState("FREE");
  const [deliveryCharge, setDeliveryCharge] = useState("0");
  const [freeShipOverAmount, setFreeShipOverAmount] = useState("0");
  const [returnCharge, setReturnCharge] = useState("5000");
  const [remoteAreaDeliverable, setRemoteAreaDeliverable] = useState("N");
  const [unionDeliveryType, setUnionDeliveryType] = useState("NOT_UNION_DELIVERY");

  // 반품/출고지
  const [returnCenterCode, setReturnCenterCode] = useState("");
  const [returnChargeName, setReturnChargeName] = useState("");
  const [companyContactNumber, setCompanyContactNumber] = useState("");
  const [returnZipCode, setReturnZipCode] = useState("");
  const [returnAddress, setReturnAddress] = useState("");
  const [returnAddressDetail, setReturnAddressDetail] = useState("");
  const [outboundShippingPlaceCode, setOutboundShippingPlaceCode] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [vendorUserId, setVendorUserId] = useState("");

  // 이미지
  const [representImage, setRepresentImage] = useState("");
  const [detailImages, setDetailImages] = useState<string[]>([""]);

  // 속성/고시/컨텐츠
  const [attributes, setAttributes] = useState<AttributeRow[]>([]);
  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [contents, setContents] = useState<ContentRow[]>([
    { id: uid(), contentType: "TEXT", content: "" },
  ]);

  // 기타
  const [taxType, setTaxType] = useState("TAX");
  const [adultOnly, setAdultOnly] = useState("EVERYONE");
  const [parallelImported, setParallelImported] = useState("NOT_PARALLEL_IMPORTED");
  const [overseasPurchased, setOverseasPurchased] = useState("NOT_OVERSEAS_PURCHASED");
  const [afterServiceInfo, setAfterServiceInfo] = useState("");
  const [afterServiceContact, setAfterServiceContact] = useState("");

  // 편집 모드
  const editId = searchParams.get("editId");
  const isEdit = !!editId;
  const [editStatus, setEditStatus] = useState<string | null>(null);

  // 드래프트/상태
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [configReady, setConfigReady] = useState<boolean | null>(true);
  const [submitting, setSubmitting] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupData, setLookupData] = useState<any>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const conn = useCoupangStatus();

  // 작업 중 폼을 sessionStorage에 보존할 키 (editId/draftId/new 단위)
  const restoredRef = useRef(false);
  const hydratedRef = useRef(false); // 초기 로드/복원 완료 후에만 자동 저장
  const formKey = `register-form:${
    searchParams.get("editId") || searchParams.get("draftId") || "new"
  }`;

  // 등록 화면 진입 시 쿠팡 연결 검증 (캐시 있으면 재호출 안 함)
  useEffect(() => {
    verifyCoupang();
  }, []);

  // 설정 로드 (셀러 기본정보 프리필) — 편집 모드에선 detail 값을 쓰므로 건너뜀
  useEffect(() => {
    if (searchParams.get("editId")) return;
    api
      .coupangGetConfig()
      .then((data) => {
        setConfigReady(data.ready);
        const d = data.defaults || {};
        setVendorId(d.coupang_vendor_id || "");
        setVendorUserId(d.coupang_vendor_user_id || "");
        setReturnCenterCode(d.coupang_return_center_code || "");
        setReturnChargeName(d.coupang_return_charge_name || "");
        setCompanyContactNumber(d.coupang_company_contact_number || "");
        setReturnZipCode(d.coupang_return_zip_code || "");
        setReturnAddress(d.coupang_return_address || "");
        setReturnAddressDetail(d.coupang_return_address_detail || "");
        setOutboundShippingPlaceCode(d.coupang_outbound_shipping_place_code || "");
        setAfterServiceContact(d.coupang_company_contact_number || "");
      })
      .catch(() => setConfigReady(false));
  }, []);

  const restoreFormData = useCallback((data: any) => {
    if (data.sellerProductName) setSellerProductName(data.sellerProductName);
    if (data.displayProductName) setDisplayProductName(data.displayProductName);
    if (data.generalProductName) setGeneralProductName(data.generalProductName);
    if (data.brand) setBrand(data.brand);
    if (data.displayCategoryCode) setDisplayCategoryCode(data.displayCategoryCode);
    if (data.productGroup) setProductGroup(data.productGroup);
    if (data.originalPrice) setOriginalPrice(String(data.originalPrice));
    if (data.salePrice) setSalePrice(String(data.salePrice));
    if (data.maximumBuyCount) setMaximumBuyCount(String(data.maximumBuyCount));
    if (data.maximumBuyForPerson) setMaximumBuyForPerson(String(data.maximumBuyForPerson));
    if (data.outboundShippingTimeDay) setOutboundShippingTimeDay(String(data.outboundShippingTimeDay));
    if (data.deliveryMethod) setDeliveryMethod(data.deliveryMethod);
    if (data.deliveryCompanyCode) setDeliveryCompanyCode(data.deliveryCompanyCode);
    if (data.deliveryChargeType) setDeliveryChargeType(data.deliveryChargeType);
    if (data.deliveryCharge) setDeliveryCharge(String(data.deliveryCharge));
    if (data.freeShipOverAmount) setFreeShipOverAmount(String(data.freeShipOverAmount));
    if (data.returnCharge) setReturnCharge(String(data.returnCharge));
    if (data.remoteAreaDeliverable) setRemoteAreaDeliverable(data.remoteAreaDeliverable);
    if (data.unionDeliveryType) setUnionDeliveryType(data.unionDeliveryType);
    if (data.representImage) setRepresentImage(data.representImage);
    if (data.detailImages) setDetailImages(data.detailImages);
    if (data.attributes) setAttributes(data.attributes);
    if (data.notices) setNotices(data.notices);
    if (data.contents) setContents(data.contents);
    if (data.taxType) setTaxType(data.taxType);
    if (data.adultOnly) setAdultOnly(data.adultOnly === "GENERAL" ? "EVERYONE" : data.adultOnly);
    if (data.parallelImported) setParallelImported(data.parallelImported);
    if (data.overseasPurchased) setOverseasPurchased(data.overseasPurchased);
    if (data.afterServiceInfo) setAfterServiceInfo(data.afterServiceInfo);
    if (data.afterServiceContact) setAfterServiceContact(data.afterServiceContact);
    if (data.searchTags) {
      setSearchTags(
        Array.isArray(data.searchTags)
          ? data.searchTags
          : String(data.searchTags).split(",").map((t) => t.trim()).filter(Boolean)
      );
    }
  }, []);

  const collectFormData = useCallback(
    () => ({
      sellerProductName, displayProductName, brand, generalProductName,
      displayCategoryCode, productGroup, originalPrice, salePrice,
      maximumBuyCount, maximumBuyForPerson, outboundShippingTimeDay,
      deliveryMethod, deliveryCompanyCode, deliveryChargeType, deliveryCharge,
      freeShipOverAmount, returnCharge, remoteAreaDeliverable, unionDeliveryType,
      representImage, detailImages, attributes, notices, contents,
      taxType, adultOnly, parallelImported, overseasPurchased,
      afterServiceInfo, afterServiceContact, searchTags,
    }),
    [
      sellerProductName, displayProductName, brand, generalProductName,
      displayCategoryCode, productGroup, originalPrice, salePrice,
      maximumBuyCount, maximumBuyForPerson, outboundShippingTimeDay,
      deliveryMethod, deliveryCompanyCode, deliveryChargeType, deliveryCharge,
      freeShipOverAmount, returnCharge, remoteAreaDeliverable, unionDeliveryType,
      representImage, detailImages, attributes, notices, contents,
      taxType, adultOnly, parallelImported, overseasPurchased,
      afterServiceInfo, afterServiceContact, searchTags,
    ]
  );

  // 작업 중 폼 자동 복원 (sessionStorage) — 페이지 이동 후 돌아와도 유지
  useEffect(() => {
    const saved = sessionStorage.getItem(formKey);
    if (saved) {
      try {
        restoreFormData(JSON.parse(saved));
        restoredRef.current = true;
      } catch {
        /* 파싱 실패 시 무시 */
      }
      hydratedRef.current = true;
    } else if (!searchParams.get("draftId") && !searchParams.get("editId")) {
      // 새 등록: 서버 로드할 게 없으니 즉시 보존 활성화
      hydratedRef.current = true;
    }
    // draftId/editId가 있으면 각 로드 useEffect가 완료 후 hydrated 설정
  }, [formKey, restoreFormData, searchParams]);

  // 폼 변경 시 자동 보존 (로드/복원 완료 후에만 — 빈 폼이 덮어쓰는 경합 방지)
  useEffect(() => {
    if (!hydratedRef.current) return;
    sessionStorage.setItem(formKey, JSON.stringify(collectFormData()));
  }, [formKey, collectFormData]);

  // draftId로 로드 (작업 중 보존본이 있으면 서버 복원은 스킵)
  useEffect(() => {
    const did = searchParams.get("draftId");
    if (did) {
      setDraftId(did);
      api
        .getDraft(did)
        .then((d) => {
          if (d.status) setDraftStatus(d.status);
          if (!restoredRef.current && d.formData) restoreFormData(d.formData);
        })
        .catch(() => {})
        .finally(() => {
          hydratedRef.current = true;
        });
    }
  }, [searchParams, restoreFormData]);

  // 쿠팡 detail(request_data) → 폼 매핑 (편집 모드)
  const restoreFromDetail = useCallback((detail: any) => {
    const item = detail.items?.[0] || {};
    setSellerProductName(detail.sellerProductName || "");
    setDisplayProductName(detail.displayProductName || "");
    setBrand(detail.brand || "");
    setGeneralProductName(detail.generalProductName || "");
    setDisplayCategoryCode(String(detail.displayCategoryCode || ""));
    setProductGroup(detail.productGroup || "");
    setOriginalPrice(String(item.originalPrice || ""));
    setSalePrice(String(item.salePrice || ""));
    setMaximumBuyCount(String(item.maximumBuyCount ?? "999"));
    setMaximumBuyForPerson(String(item.maximumBuyForPerson ?? "0"));
    setOutboundShippingTimeDay(String(item.outboundShippingTimeDay ?? "2"));
    setDeliveryMethod(detail.deliveryMethod || "SEQUENCIAL");
    setDeliveryCompanyCode(detail.deliveryCompanyCode || "KGB");
    setDeliveryChargeType(detail.deliveryChargeType || "FREE");
    setDeliveryCharge(String(detail.deliveryCharge ?? "0"));
    setFreeShipOverAmount(String(detail.freeShipOverAmount ?? "0"));
    setReturnCharge(String(detail.returnCharge ?? detail.deliveryChargeOnReturn ?? "5000"));
    setRemoteAreaDeliverable(detail.remoteAreaDeliverable || "N");
    setUnionDeliveryType(detail.unionDeliveryType || "NOT_UNION_DELIVERY");
    setReturnCenterCode(detail.returnCenterCode || "");
    setReturnChargeName(detail.returnChargeName || "");
    setCompanyContactNumber(detail.companyContactNumber || "");
    setReturnZipCode(detail.returnZipCode || "");
    setReturnAddress(detail.returnAddress || "");
    setReturnAddressDetail(detail.returnAddressDetail || "");
    setOutboundShippingPlaceCode(String(detail.outboundShippingPlaceCode || ""));
    setVendorId(detail.vendorId || "");
    setVendorUserId(detail.vendorUserId || "");
    setAfterServiceInfo(detail.afterServiceInformation || "");
    setAfterServiceContact(detail.afterServiceContactNumber || "");
    setTaxType(item.taxType || "TAX");
    setAdultOnly(item.adultOnly === "GENERAL" ? "EVERYONE" : item.adultOnly || "EVERYONE");
    setParallelImported(item.parallelImported || "NOT_PARALLEL_IMPORTED");
    setOverseasPurchased(item.overseasPurchased || "NOT_OVERSEAS_PURCHASED");

    const imgs: any[] = item.images || [];
    const rep = imgs.find((i) => i.imageType === "REPRESENTATION");
    setRepresentImage(rep?.vendorPath || rep?.cdnPath || "");
    const dets = imgs.filter((i) => i.imageType === "DETAIL").map((i) => i.vendorPath || i.cdnPath || "");
    setDetailImages(dets.length ? dets : [""]);

    setNotices((item.notices || []).map((n: any) => ({ id: uid(), noticeCategoryName: n.noticeCategoryName, noticeCategoryDetailName: n.noticeCategoryDetailName, content: n.content })));
    setAttributes((item.attributes || []).map((a: any) => ({ id: uid(), attributeTypeName: a.attributeTypeName, attributeValueName: a.attributeValueName })));

    const cs = (item.contents || []).map((c: any) => {
      if (c.contentsType) {
        const d = c.contentDetails?.[0] || {};
        return { id: uid(), contentType: (d.detailType === "IMAGE" ? "IMAGE" : "TEXT") as "TEXT" | "IMAGE", content: d.content || "" };
      }
      return { id: uid(), contentType: (c.contentType || "TEXT") as "TEXT" | "IMAGE", content: c.content || "" };
    });
    setContents(cs.length ? cs : [{ id: uid(), contentType: "TEXT", content: "" }]);

    const tags = item.searchTags;
    setSearchTags(Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(",").map((t: string) => t.trim()).filter(Boolean) : []);
  }, []);

  useEffect(() => {
    if (editId) {
      api
        .getRegisteredProduct(editId)
        .then((p) => {
          setEditStatus(p.status);
          if (!restoredRef.current && p.requestData)
            restoreFromDetail(p.requestData);
        })
        .catch(() => {})
        .finally(() => {
          hydratedRef.current = true;
        });
    }
  }, [editId, restoreFromDetail]);

  const handleSaveDraft = async () => {
    setDraftSaving(true);
    try {
      const d = await api.upsertDraft({
        id: draftId || undefined,
        productName: sellerProductName || "임시저장",
        formData: collectFormData(),
      });
      setDraftId(d.id);
      toast.success("임시저장되었습니다.");
    } catch (e) {
      toast.error(`임시저장 실패: ${String(e)}`);
    } finally {
      setDraftSaving(false);
    }
  };

  const handleCategoryPredict = async () => {
    const name = sellerProductName || displayProductName || generalProductName;
    if (!name.trim()) {
      toast.warning("카테고리 추천을 위해 상품명을 먼저 입력하세요.");
      return;
    }
    setCategoryLoading(true);
    try {
      const data = await api.coupangPredictCategory(name, brand || undefined);
      const predicted = data?.data;
      if (predicted?.predictedCategoryId) {
        setDisplayCategoryCode(predicted.predictedCategoryId);
        toast.success(`추천: ${predicted.predictedCategoryName} (${predicted.predictedCategoryId})`);
      } else {
        toast.error(predicted?.comment || "카테고리 추천 실패");
      }
    } catch (e) {
      toast.error(`카테고리 추천 실패: ${String(e)}`);
    } finally {
      setCategoryLoading(false);
    }
  };

  const handleLoadMeta = async () => {
    if (!displayCategoryCode.trim()) {
      toast.warning("카테고리 코드를 먼저 입력하세요.");
      return;
    }
    setMetaLoading(true);
    try {
      const data = await api.coupangGetMeta(displayCategoryCode);
      const meta = data?.data || data;
      if (meta.noticeCategories?.length > 0) {
        const first = meta.noticeCategories[0];
        const newNotices = (first.noticeCategoryDetailNames || []).map((detail: any) => ({
          id: uid(),
          noticeCategoryName: first.noticeCategoryName,
          noticeCategoryDetailName: detail.noticeCategoryDetailName,
          content: "상세페이지 참조",
        }));
        if (newNotices.length > 0) setNotices(newNotices);
      }
      if (meta.attributes?.length > 0) {
        const newAttrs = meta.attributes
          .filter((a: any) => a.required === "MANDATORY")
          .map((a: any) => ({ id: uid(), attributeTypeName: a.attributeTypeName, attributeValueName: "", mandatory: true }));
        if (newAttrs.length > 0) setAttributes(newAttrs);
      }
      toast.success("메타정보를 불러왔습니다. 고시정보와 옵션을 확인하세요.");
    } catch (e) {
      toast.error(`메타정보 조회 실패: ${String(e)}`);
    } finally {
      setMetaLoading(false);
    }
  };

  const handleLookup = async () => {
    setLookupLoading(true);
    try {
      setLookupData(await api.coupangLookup());
    } catch (e) {
      toast.error(`조회 실패: ${String(e)}`);
    } finally {
      setLookupLoading(false);
    }
  };

  const applyReturnCenter = (c: any) => {
    setReturnCenterCode(String(c.returnCenterCode || ""));
    setReturnChargeName(c.shippingPlaceName || c.returnChargeName || "");
    setCompanyContactNumber(c.placeAddresses?.[0]?.companyContactNumber || c.companyContactNumber || "");
    setReturnZipCode(c.placeAddresses?.[0]?.returnZipCode || c.returnZipCode || "");
    setReturnAddress(c.placeAddresses?.[0]?.returnAddress || c.returnAddress || "");
    setReturnAddressDetail(c.placeAddresses?.[0]?.returnAddressDetail || c.returnAddressDetail || "");
    toast.success("반품지를 적용했습니다.");
  };
  const applyShippingPlace = (p: any) => {
    setOutboundShippingPlaceCode(String(p.outboundShippingPlaceCode || ""));
    toast.success("출고지를 적용했습니다.");
  };

  const handleSubmit = async () => {
    // zod 검증 (흩어진 alert → 스키마 한 곳)
    const parsed = registerSchema.safeParse({
      sellerProductName,
      displayCategoryCode,
      salePrice,
      representImage,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !errs[key]) errs[key] = issue.message;
      }
      setErrors(errs);
      toast.error("입력값을 확인하세요.");
      return;
    }
    setErrors({});

    // 카테고리 필수 옵션(MANDATORY) 빈 값 검증 — 비면 쿠팡 승인에서 반려됨
    const missingAttrs = attributes.filter(
      (a) => a.mandatory && !a.attributeValueName.trim()
    );
    if (missingAttrs.length) {
      toast.error(
        `필수 옵션을 입력하세요: ${missingAttrs
          .map((a) => a.attributeTypeName)
          .join(", ")}`
      );
      return;
    }

    setSubmitting(true);

    const images = [
      { imageOrder: 0, imageType: "REPRESENTATION" as const, vendorPath: representImage },
      ...detailImages
        .filter((u) => u.trim())
        .map((u, i) => ({ imageOrder: i + 1, imageType: "DETAIL" as const, vendorPath: u })),
    ];

    const now = new Date();
    const saleStartedAt = now.toISOString().slice(0, 19);
    const saleEndedAt = "2099-01-01T23:59:59";

    const product = {
      displayCategoryCode: Number(displayCategoryCode),
      sellerProductName,
      vendorId,
      saleStartedAt,
      saleEndedAt,
      displayProductName,
      brand,
      generalProductName,
      productGroup: productGroup || "",
      deliveryMethod,
      deliveryCompanyCode,
      deliveryChargeType,
      deliveryCharge: Number(deliveryCharge),
      freeShipOverAmount: Number(freeShipOverAmount),
      deliveryChargeOnReturn: Number(returnCharge),
      remoteAreaDeliverable,
      unionDeliveryType,
      returnCenterCode,
      returnChargeName,
      companyContactNumber,
      returnZipCode,
      returnAddress,
      returnAddressDetail,
      returnCharge: Number(returnCharge),
      returnChargeVendor: "BUYER",
      afterServiceInformation: afterServiceInfo || "판매자 문의",
      afterServiceContactNumber: afterServiceContact,
      outboundShippingPlaceCode: Number(outboundShippingPlaceCode),
      vendorUserId,
      requested: false,
      items: [
        {
          itemName: sellerProductName,
          originalPrice: Number(originalPrice) || Number(salePrice),
          salePrice: Number(salePrice),
          maximumBuyCount: Number(maximumBuyCount),
          maximumBuyForPerson: Number(maximumBuyForPerson),
          maximumBuyForPersonPeriod: 1,
          outboundShippingTimeDay: Number(outboundShippingTimeDay),
          unitCount: 1,
          adultOnly,
          taxType,
          parallelImported,
          overseasPurchased,
          pccNeeded: false,
          bestPriceGuaranteed3P: false,
          searchTags: searchTags.filter((t) => t.trim()),
          images,
          notices: notices
            .filter((n) => n.noticeCategoryName && n.content)
            .map(({ noticeCategoryName, noticeCategoryDetailName, content }) => ({
              noticeCategoryName,
              noticeCategoryDetailName,
              content,
            })),
          attributes: attributes
            .filter((a) => a.attributeTypeName && a.attributeValueName)
            .map(({ attributeTypeName, attributeValueName }) => ({
              attributeTypeName,
              attributeValueName,
            })),
          contents: contents
            .filter((c) => c.content.trim())
            .map(({ contentType, content }) => ({ contentType, content })),
          offerCondition: "NEW",
          offerDescription: "",
        },
      ],
    };

    try {
      if (isEdit) {
        const data = await api.coupangUpdateProduct(editId!, product);
        toast.success(
          `상품 수정 완료! (상태: ${data.coupangStatus})` +
            (data.warningMessage ? `\n⚠️ ${data.warningMessage}` : "")
        );
        sessionStorage.removeItem(formKey);
        setSubmitting(false);
        return;
      }
      const data = await api.coupangRegisterProduct(product, draftId || undefined);
      toast.success(
        `상품 등록 성공! (sellerProductId: ${data.sellerProductId})` +
          (data.warningMessage ? `\n⚠️ ${data.warningMessage}` : "")
      );
      sessionStorage.removeItem(formKey);
      setDraftStatus("registered");
    } catch (e) {
      toast.error(String(e));
      if (draftId) {
        api
          .upsertDraft({
            id: draftId,
            productName: sellerProductName,
            formData: collectFormData(),
            status: "failed",
          })
          .catch(() => {});
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 동적 행 헬퍼
  const addAttribute = () =>
    setAttributes((p) => [...p, { id: uid(), attributeTypeName: "", attributeValueName: "" }]);
  const addNotice = () =>
    setNotices((p) => [...p, { id: uid(), noticeCategoryName: "", noticeCategoryDetailName: "", content: "" }]);
  const addContent = () =>
    setContents((p) => [...p, { id: uid(), contentType: "TEXT", content: "" }]);

  const submitDisabled =
    submitting || configReady === false || draftStatus === "registered" || draftStatus === "approved";

  const returnCenters = lookupData?.returnCenters?.data?.content as any[] | undefined;
  const shippingPlaces = (lookupData?.shippingPlaces?.content ||
    lookupData?.shippingPlaces?.data?.content) as any[] | undefined;

  // ── 쿠팡 연결 게이트 — 인증/설정 안 됐으면 폼 진입 차단 ──
  if (conn.status === "checking" || conn.status === "unknown") {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        쿠팡 연결 확인 중...
      </div>
    );
  }
  if (conn.status !== "connected") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">
              <AlertTriangle className="size-6" />
            </div>
            <div>
              <p className="text-lg font-semibold">
                쿠팡 연결을 먼저 완료하세요
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {conn.status === "not_configured"
                  ? conn.message
                  : `인증 실패: ${conn.message}`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild>
                <Link to="/settings">설정으로 이동</Link>
              </Button>
              <Button variant="outline" onClick={() => verifyCoupang(true)}>
                다시 확인
              </Button>
            </div>
          </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon-sm">
              <Link to="/">
                <ArrowLeft />
              </Link>
            </Button>
            <h1 className="text-xl font-bold">
              {isEdit ? "쿠팡 상품 수정" : "쿠팡 상품 등록"}
            </h1>
            {isEdit && editStatus && (
              <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 text-violet-300">
                {editStatus}
              </Badge>
            )}
          </div>
          {!isEdit && (
            <Button variant="outline" onClick={handleSaveDraft} disabled={draftSaving}>
              {draftSaving ? (
                <>
                  <Loader2 className="animate-spin" />
                  저장 중...
                </>
              ) : (
                "임시저장"
              )}
            </Button>
          )}
        </div>

        {configReady === false && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            쿠팡 키 또는 셀러 기본정보가 설정되지 않았습니다.{" "}
            <Link to="/settings" className="underline">
              설정
            </Link>
            에서 입력하세요.
          </div>
        )}

        {/* 1. 기본 정보 */}
        <Section title="기본 정보">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="등록상품명 *" error={errors.sellerProductName}>
              <Input
                value={sellerProductName}
                onChange={(e) => setSellerProductName(e.target.value)}
                placeholder="쿠팡에 등록될 상품명"
                aria-invalid={!!errors.sellerProductName}
              />
            </Field>
            <Field label="노출상품명">
              <Input value={displayProductName} onChange={(e) => setDisplayProductName(e.target.value)} />
            </Field>
            <Field label="브랜드">
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
            </Field>
            <Field label="제품명">
              <Input value={generalProductName} onChange={(e) => setGeneralProductName(e.target.value)} />
            </Field>
            <Field label="카테고리 코드 *" error={errors.displayCategoryCode}>
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  value={displayCategoryCode}
                  onChange={(e) => setDisplayCategoryCode(e.target.value)}
                  placeholder="숫자"
                  aria-invalid={!!errors.displayCategoryCode}
                />
                <Button type="button" variant="outline" onClick={handleCategoryPredict} disabled={categoryLoading}>
                  {categoryLoading ? <Loader2 className="animate-spin" /> : "AI 추천"}
                </Button>
                <Button type="button" variant="outline" onClick={handleLoadMeta} disabled={metaLoading || !displayCategoryCode.trim()}>
                  {metaLoading ? <Loader2 className="animate-spin" /> : "메타"}
                </Button>
              </div>
            </Field>
            <Field label="상품그룹">
              <Input value={productGroup} onChange={(e) => setProductGroup(e.target.value)} />
            </Field>
          </div>
        </Section>

        {/* 2. 가격/재고 */}
        <Section title="가격 / 재고">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="할인율기준가 (원가)">
              <Input type="number" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} />
            </Field>
            <Field label="판매가격 *" error={errors.salePrice}>
              <Input type="number" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} aria-invalid={!!errors.salePrice} />
            </Field>
            <Field label="판매가능수량">
              <Input type="number" value={maximumBuyCount} onChange={(e) => setMaximumBuyCount(e.target.value)} />
            </Field>
            <Field label="인당 최대구매 (0=무제한)">
              <Input type="number" value={maximumBuyForPerson} onChange={(e) => setMaximumBuyForPerson(e.target.value)} />
            </Field>
            <Field label="출고 소요일">
              <Input type="number" value={outboundShippingTimeDay} onChange={(e) => setOutboundShippingTimeDay(e.target.value)} />
            </Field>
            <Field label="검색 태그">
              <TagInput value={searchTags} onChange={setSearchTags} />
            </Field>
          </div>
        </Section>

        {/* 3. 배송 */}
        <Section title="배송 설정">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="배송방법">
              <select className={selectCls} value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)}>
                <option value="SEQUENCIAL">순차배송</option>
                <option value="COLD_FRESH">냉장/냉동</option>
                <option value="MAKE_ORDER">주문제작</option>
                <option value="AGENT_BUY">구매대행</option>
                <option value="VENDOR_DIRECT">업체직송</option>
              </select>
            </Field>
            <Field label="택배사">
              <select className={selectCls} value={deliveryCompanyCode} onChange={(e) => setDeliveryCompanyCode(e.target.value)}>
                <option value="KGB">로젠택배</option>
                <option value="CJGLS">CJ대한통운</option>
                <option value="HANJIN">한진택배</option>
                <option value="HYUNDAI">현대택배</option>
                <option value="EPOST">우체국택배</option>
              </select>
            </Field>
            <Field label="배송비 종류">
              <select className={selectCls} value={deliveryChargeType} onChange={(e) => setDeliveryChargeType(e.target.value)}>
                <option value="FREE">무료</option>
                <option value="NOT_FREE">유료</option>
                <option value="CONDITIONAL_FREE">조건부 무료</option>
                <option value="CHARGE_RECEIVED">착불</option>
              </select>
            </Field>
            <Field label="기본배송비">
              <Input type="number" value={deliveryCharge} onChange={(e) => setDeliveryCharge(e.target.value)} />
            </Field>
            <Field label="무료배송 기준금액">
              <Input type="number" value={freeShipOverAmount} onChange={(e) => setFreeShipOverAmount(e.target.value)} />
            </Field>
            <Field label="반품배송비">
              <Input type="number" value={returnCharge} onChange={(e) => setReturnCharge(e.target.value)} />
            </Field>
            <Field label="도서산간 배송">
              <select className={selectCls} value={remoteAreaDeliverable} onChange={(e) => setRemoteAreaDeliverable(e.target.value)}>
                <option value="N">불가</option>
                <option value="Y">가능</option>
              </select>
            </Field>
            <Field label="묶음배송">
              <select className={selectCls} value={unionDeliveryType} onChange={(e) => setUnionDeliveryType(e.target.value)}>
                <option value="NOT_UNION_DELIVERY">불가</option>
                <option value="UNION_DELIVERY">가능</option>
              </select>
            </Field>
          </div>
        </Section>

        {/* 4. 반품/출고지 */}
        <Section title="반품 / 출고지">
          <Button type="button" variant="outline" onClick={handleLookup} disabled={lookupLoading} className="mb-4">
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
            <div className="mb-4 space-y-2 rounded-lg border border-border bg-secondary/40 p-4">
              <p className="mb-1 text-sm font-medium text-primary">반품지 (클릭하여 적용)</p>
              {returnCenters.map((c, i) => (
                <button key={i} type="button" onClick={() => applyReturnCenter(c)} className="w-full rounded-md border border-border bg-card p-3 text-left text-sm transition-colors hover:bg-secondary">
                  <span className="font-medium">{c.shippingPlaceName || c.returnChargeName || `반품지 ${i + 1}`}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">코드: {c.returnCenterCode}</span>
                </button>
              ))}
            </div>
          )}
          {shippingPlaces && shippingPlaces.length > 0 && (
            <div className="mb-4 space-y-2 rounded-lg border border-border bg-secondary/40 p-4">
              <p className="mb-1 text-sm font-medium text-primary">출고지 (클릭하여 적용)</p>
              {shippingPlaces.map((p, i) => (
                <button key={i} type="button" onClick={() => applyShippingPlace(p)} className="w-full rounded-md border border-border bg-card p-3 text-left text-sm transition-colors hover:bg-secondary">
                  <span className="font-medium">{p.shippingPlaceName || `출고지 ${i + 1}`}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">코드: {p.outboundShippingPlaceCode}</span>
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="판매자 ID"><Input value={vendorId} onChange={(e) => setVendorId(e.target.value)} /></Field>
            <Field label="판매자 User ID"><Input value={vendorUserId} onChange={(e) => setVendorUserId(e.target.value)} /></Field>
            <Field label="반품지 센터코드"><Input value={returnCenterCode} onChange={(e) => setReturnCenterCode(e.target.value)} /></Field>
            <Field label="반품지명"><Input value={returnChargeName} onChange={(e) => setReturnChargeName(e.target.value)} /></Field>
            <Field label="연락처"><Input value={companyContactNumber} onChange={(e) => setCompanyContactNumber(e.target.value)} /></Field>
            <Field label="반품지 우편번호"><Input value={returnZipCode} onChange={(e) => setReturnZipCode(e.target.value)} /></Field>
            <Field label="반품지 주소"><Input value={returnAddress} onChange={(e) => setReturnAddress(e.target.value)} /></Field>
            <Field label="반품지 상세주소"><Input value={returnAddressDetail} onChange={(e) => setReturnAddressDetail(e.target.value)} /></Field>
            <Field label="출고지 주소코드"><Input value={outboundShippingPlaceCode} onChange={(e) => setOutboundShippingPlaceCode(e.target.value)} /></Field>
          </div>
        </Section>

        {/* 5. 이미지 */}
        <Section title="이미지">
          <Field label="대표이미지 URL *" error={errors.representImage}>
            <Input value={representImage} onChange={(e) => setRepresentImage(e.target.value)} placeholder="https://..." aria-invalid={!!errors.representImage} />
          </Field>
          {representImage && (
            <img src={representImage} alt="대표" className="mt-2 size-24 rounded-lg bg-secondary object-cover" />
          )}
          <div className="mt-4">
            <Label className="mb-1.5 block">상세이미지 URL</Label>
            {detailImages.map((url, idx) => (
              <div key={idx} className="mb-2 flex gap-2">
                <Input value={url} onChange={(e) => setDetailImages((p) => p.map((v, i) => (i === idx ? e.target.value : v)))} placeholder="https://..." />
                <Button type="button" variant="destructive" size="icon" onClick={() => setDetailImages((p) => p.filter((_, i) => i !== idx))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" className="text-primary" onClick={() => setDetailImages((p) => [...p, ""])}>
              <Plus />
              이미지 추가
            </Button>
          </div>
        </Section>

        {/* 6. 옵션/속성 */}
        <Section title="옵션 / 속성">
          {attributes.length === 0 && (
            <p className="mb-3 text-sm text-muted-foreground">
              카테고리의 <b className="text-foreground">필수 옵션</b>(예: 수량,
              농산물 중량)을 불러오려면 위 <b className="text-foreground">기본 정보</b>
              에서 카테고리 코드 입력 후 <b className="text-primary">메타</b> 버튼을
              누르세요.
            </p>
          )}
          {attributes.map((attr) => {
            const missing = !!attr.mandatory && !attr.attributeValueName.trim();
            return (
              <div key={attr.id} className="mb-2 flex items-center gap-2">
                <Input
                  value={attr.attributeTypeName}
                  onChange={(e) =>
                    setAttributes((p) =>
                      p.map((a) =>
                        a.id === attr.id
                          ? { ...a, attributeTypeName: e.target.value }
                          : a
                      )
                    )
                  }
                  placeholder="속성명 (예: 사이즈)"
                  readOnly={attr.mandatory}
                  className={cn("flex-1", attr.mandatory && "bg-muted/40")}
                />
                <Input
                  value={attr.attributeValueName}
                  onChange={(e) =>
                    setAttributes((p) =>
                      p.map((a) =>
                        a.id === attr.id
                          ? { ...a, attributeValueName: e.target.value }
                          : a
                      )
                    )
                  }
                  placeholder={attr.mandatory ? "필수 입력" : "속성값 (예: 500ml)"}
                  aria-invalid={missing}
                  className="flex-1"
                />
                {attr.mandatory ? (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-amber-500/30 bg-amber-500/10 text-amber-300"
                  >
                    필수
                  </Badge>
                ) : (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    onClick={() =>
                      setAttributes((p) => p.filter((a) => a.id !== attr.id))
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-primary"
            onClick={addAttribute}
          >
            <Plus />
            속성 추가
          </Button>
        </Section>

        {/* 7. 상품고시 */}
        <Section title="상품고시정보">
          {notices.map((n) => (
            <div key={n.id} className="mb-2 flex gap-2">
              <Input value={n.noticeCategoryName} onChange={(e) => setNotices((p) => p.map((x) => (x.id === n.id ? { ...x, noticeCategoryName: e.target.value } : x)))} placeholder="고시 카테고리" />
              <Input value={n.noticeCategoryDetailName} onChange={(e) => setNotices((p) => p.map((x) => (x.id === n.id ? { ...x, noticeCategoryDetailName: e.target.value } : x)))} placeholder="고시 항목" />
              <Input value={n.content} onChange={(e) => setNotices((p) => p.map((x) => (x.id === n.id ? { ...x, content: e.target.value } : x)))} placeholder="내용" />
              <Button type="button" variant="destructive" size="icon" onClick={() => setNotices((p) => p.filter((x) => x.id !== n.id))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" className="text-primary" onClick={addNotice}>
            <Plus />
            고시정보 추가
          </Button>
        </Section>

        {/* 8. 상세 컨텐츠 */}
        <Section title="상세 컨텐츠">
          {contents.map((c) => (
            <div key={c.id} className="mb-3 space-y-2">
              <div className="flex gap-2">
                <select className={cn(selectCls, "w-36")} value={c.contentType} onChange={(e) => setContents((p) => p.map((x) => (x.id === c.id ? { ...x, contentType: e.target.value as "TEXT" | "IMAGE" } : x)))}>
                  <option value="TEXT">텍스트/HTML</option>
                  <option value="IMAGE">이미지 URL</option>
                </select>
                <Button type="button" variant="destructive" size="icon" onClick={() => setContents((p) => p.filter((x) => x.id !== c.id))}>
                  <Trash2 />
                </Button>
              </div>
              {c.contentType === "TEXT" ? (
                <Textarea className="min-h-[120px]" value={c.content} onChange={(e) => setContents((p) => p.map((x) => (x.id === c.id ? { ...x, content: e.target.value } : x)))} placeholder="HTML 또는 텍스트" />
              ) : (
                <Input value={c.content} onChange={(e) => setContents((p) => p.map((x) => (x.id === c.id ? { ...x, content: e.target.value } : x)))} placeholder="이미지 URL" />
              )}
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" className="text-primary" onClick={addContent}>
            <Plus />
            컨텐츠 추가
          </Button>
        </Section>

        {/* 9. 기타 */}
        <Section title="기타 설정">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="과세여부">
              <select className={selectCls} value={taxType} onChange={(e) => setTaxType(e.target.value)}>
                <option value="TAX">과세</option>
                <option value="FREE">면세</option>
              </select>
            </Field>
            <Field label="19세 이상">
              <select className={selectCls} value={adultOnly} onChange={(e) => setAdultOnly(e.target.value)}>
                <option value="EVERYONE">전체</option>
                <option value="ADULT_ONLY">19세 이상</option>
              </select>
            </Field>
            <Field label="병행수입">
              <select className={selectCls} value={parallelImported} onChange={(e) => setParallelImported(e.target.value)}>
                <option value="NOT_PARALLEL_IMPORTED">아님</option>
                <option value="PARALLEL_IMPORTED">병행수입</option>
              </select>
            </Field>
            <Field label="해외구매대행">
              <select className={selectCls} value={overseasPurchased} onChange={(e) => setOverseasPurchased(e.target.value)}>
                <option value="NOT_OVERSEAS_PURCHASED">아님</option>
                <option value="OVERSEAS_PURCHASED">해외구매대행</option>
              </select>
            </Field>
            <Field label="A/S 정보">
              <Input value={afterServiceInfo} onChange={(e) => setAfterServiceInfo(e.target.value)} placeholder="기본: 판매자 문의" />
            </Field>
            <Field label="A/S 연락처">
              <Input value={afterServiceContact} onChange={(e) => setAfterServiceContact(e.target.value)} />
            </Field>
          </div>
        </Section>

        <div className="flex justify-end gap-3 pb-8">
          <Button variant="ghost" onClick={() => navigate("/")}>
            취소
          </Button>
          {!isEdit && (
            <Button variant="outline" onClick={handleSaveDraft} disabled={draftSaving}>
              {draftSaving ? (
                <>
                  <Loader2 className="animate-spin" />
                  저장 중...
                </>
              ) : (
                "임시저장"
              )}
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={isEdit ? submitting : submitDisabled}>
            {submitting && <Loader2 className="animate-spin" />}
            {isEdit
              ? submitting
                ? "수정 중..."
                : "수정 저장"
              : draftStatus === "approved"
                ? "등록 및 승인완료"
                : draftStatus === "registered"
                  ? "등록완료"
                  : submitting
                    ? "등록 중..."
                    : "쿠팡에 등록"}
          </Button>
        </div>
      </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className={error ? "text-destructive" : undefined}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** 검색 태그 칩 입력 — Enter/쉼표로 추가, X·Backspace로 삭제. */
function TagInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const add = (raw: string) => {
    const t = raw.replace(/,/g, "").trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-input/40 px-2 py-1.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
      {value.map((tag, i) => (
        <Badge key={`${tag}-${i}`} variant="secondary" className="gap-1 pr-1">
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            className="rounded-sm text-muted-foreground hover:text-foreground"
            aria-label={`${tag} 삭제`}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        className="min-w-[140px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(input);
          } else if (e.key === "Backspace" && !input && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => input.trim() && add(input)}
        placeholder={value.length ? "" : "태그 입력 후 Enter 또는 쉼표"}
      />
    </div>
  );
}
