import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { logIpc } from "./log-store";

/** 모든 IPC 호출을 전역 로그 스토어에 기록하는 invoke 래퍼. */
async function invoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  const start = performance.now();
  try {
    const result = await tauriInvoke<T>(command, args);
    logIpc({
      command,
      args,
      status: "ok",
      durationMs: performance.now() - start,
    });
    return result;
  } catch (e) {
    logIpc({
      command,
      args,
      status: "error",
      durationMs: performance.now() - start,
      error: String(e),
    });
    throw e;
  }
}

export interface AppInfo {
  app_data_dir: string;
  db_path: string;
  platform: string;
}

export type Settings = Record<string, string>;

export interface HealthResult {
  ok: boolean;
  message: string;
}

export interface HotProduct {
  rank: number;
  code: string;
  name: string;
  originalPrice: number | null;
  salePrice: number | null;
  discountRate: string | null;
  image: string | null;
  detailUrl: string;
}

/** 크롤 결과 1건 = 상품 + 이번 크롤 상태(신규/가격변동). 백엔드에서 flatten. */
export interface CrawlItemResult extends HotProduct {
  status: "new" | "updated" | "unchanged";
  prevSalePrice: number | null;
}

/** 수집 상품 마스터 1행. */
export interface CrawledProduct {
  id: string;
  source: string;
  category: string;
  code: string;
  name: string;
  originalPrice: number | null;
  salePrice: number | null;
  discountRate: string | null;
  image: string | null;
  detailUrl: string | null;
  lastRank: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface CoupangConfig {
  hasKeys: boolean;
  hasVendor: boolean;
  ready: boolean;
  defaults: Record<string, string>;
}

export interface Draft {
  id: string;
  productCode: string | null;
  productName: string;
  formData: Record<string, unknown>;
  status: string;
  coupangProductId: string | null;
  coupangStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterResult {
  sellerProductId: number | null;
  coupangStatus: string;
  warningMessage: string | null;
}

export interface ApproveResult {
  message: string;
  reapproved: boolean;
  alreadyApproved: boolean;
  statusName: string | null;
}

export interface RegisteredProduct {
  id: string;
  draftId: string | null;
  sellerProductId: number | null;
  productName: string | null;
  salePrice: number | null;
  status: string;
  coupangStatus: string | null;
  requestData?: Record<string, unknown>;
  registeredAt: string;
  updatedAt: string;
}

/** 백엔드 커맨드 호출 래퍼. */
export const api = {
  appInfo: () => invoke<AppInfo>("app_info"),

  // settings
  getSettings: () => invoke<Settings>("get_settings"),
  getSetting: (key: string) => invoke<string>("get_setting", { key }),
  saveSettings: (entries: Settings) => invoke<void>("save_settings", { entries }),

  // coupang
  coupangHealth: () => invoke<HealthResult>("coupang_health"),
  coupangGetConfig: () => invoke<CoupangConfig>("coupang_get_config"),
  coupangPredictCategory: (productName: string, brand?: string) =>
    invoke<any>("coupang_predict_category", { productName, brand }),
  coupangGetMeta: (categoryCode: string) =>
    invoke<any>("coupang_get_meta", { categoryCode }),
  coupangLookup: () => invoke<any>("coupang_lookup"),
  coupangRegisterProduct: (product: unknown, draftId?: string) =>
    invoke<RegisterResult>("coupang_register_product", { product, draftId }),
  coupangApproveProduct: (sellerProductId: number, draftId?: string) =>
    invoke<ApproveResult>("coupang_approve_product", { sellerProductId, draftId }),
  coupangUpdateProduct: (registeredId: string, product: unknown) =>
    invoke<RegisterResult>("coupang_update_product", { registeredId, product }),
  coupangSyncProduct: (sellerProductId: number, registeredId: string) =>
    invoke<any>("coupang_sync_product", { sellerProductId, registeredId }),

  // crawl (스냅샷 폐기 → 마스터 upsert + 목록)
  crawlSite: (source: string) =>
    invoke<CrawlItemResult[]>("crawl_site", { source }),
  listCrawledProducts: (source?: string, category?: string) =>
    invoke<CrawledProduct[]>("list_crawled_products", { source, category }),
  deleteCrawledProduct: (id: string) =>
    invoke<void>("delete_crawled_product", { id }),

  // drafts
  listDrafts: (productCode?: string) =>
    invoke<Draft[]>("list_drafts", { productCode }),
  getDraft: (id: string) => invoke<Draft>("get_draft", { id }),
  upsertDraft: (input: {
    id?: string;
    productCode?: string;
    productName?: string;
    formData?: Record<string, unknown>;
    status?: string;
  }) => invoke<Draft>("upsert_draft", input),
  deleteDraft: (id: string) => invoke<void>("delete_draft", { id }),

  // registered products
  listRegisteredProducts: () =>
    invoke<RegisteredProduct[]>("list_registered_products"),
  getRegisteredProduct: (id: string) =>
    invoke<RegisteredProduct>("get_registered_product", { id }),
};
