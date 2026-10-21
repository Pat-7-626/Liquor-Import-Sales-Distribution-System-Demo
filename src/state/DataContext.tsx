import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  Bilingual,
  ChannelCode,
  ExchangeRate,
  CompanyProfile,
  DeliveryStatus,
  DocumentKind,
  ImportOrder,
  ImportOrderLineItem,
  License,
  PaymentMethod,
  Product,
  ReorderPolicy,
  SalesOrder,
  Supplier,
  TaxSettings,
  Warehouse,
} from "../data/types";
import type {
  OpeningPayableInput,
  OpeningReceivableInput,
  OpeningStockInput,
  BankLineInput,
  ExpenseInput,
  JournalInput,
  PurchaseRequestInput,
  QuotationInput,
  CustomerProfileInput,
  InventoryAdjustment,
  NewCustomerInput,
  NewImportOrderInput,
  NewLicenseInput,
  NewProductInput,
  NewSalesOrderInput,
  ReceiveGoodsInput,
  SalesOrderTerms,
} from "../domain/actions";
import type { Store } from "../domain/store";
import type { AuditEntry } from "../data/types";

/**
 * What the server sends: everything except the stock ledger and the audit log, which grow without bound
 * and are read a page at a time (useApi). The latest audit entries come along as recent activity.
 */
export type ClientState = Omit<Store, "stockMovements" | "auditLog"> & { recentActivity: AuditEntry[] };
import { api, asResult, type ActionResult } from "../lib/api";
import { useLanguage } from "../i18n/LanguageContext";
import { useRole } from "./RoleContext";

export type { ActionResult } from "../lib/api";
export type {
  OpeningPayableInput,
  OpeningReceivableInput,
  OpeningStockInput,
  BankLineInput,
  ExpenseInput,
  JournalInput,
  PurchaseRequestInput,
  QuotationInput,
  CustomerProfileInput,
  InventoryAdjustment,
  NewCustomerInput,
  NewImportOrderInput,
  NewLicenseInput,
  NewProductInput,
  NewSalesOrderInput,
  ReceiveGoodsInput,
  SalesOrderTerms,
} from "../domain/actions";

type Result<T = object> = Promise<ActionResult & T>;

/**
 * The app's data, served by the API. Every write is a named server command — the business rules,
 * permission checks, and price masking all run on the server; the browser only displays the result.
 */
interface DataContextValue extends ClientState {
  /** Bumps whenever the data changes — queries that read beyond the state refetch on it. */
  version: number;
  createProduct: (input: NewProductInput) => Result;
  createCustomer: (input: NewCustomerInput) => Result;
  createLicense: (input: NewLicenseInput) => Result;
  saveSupplier: (supplier: Supplier, mode: "create" | "update") => Result;
  saveWarehouse: (warehouse: Warehouse, mode: "create" | "update") => Result;
  updatePriceList: (channel: ChannelCode, adjustmentPercent: number) => Result;
  setPriceOverride: (channel: ChannelCode, sku: string, price: number | null) => Result;
  updateTaxSettings: (settings: TaxSettings) => Result;
  saveReorderPolicy: (policy: ReorderPolicy) => Result;

  updateProduct: (sku: string, patch: Pick<Product, "costPrice" | "suggestedPrice">) => Result;
  updateImportOrder: (orderNo: string, patch: Pick<ImportOrder, "etaDate">) => Result;
  recordCustomsClearance: (orderNo: string, declarationNo: string) => Result;
  updateLicense: (licenseNo: string, patch: Pick<License, "expiryDate">) => Result;
  updateCustomerTerms: (
    customerId: string,
    patch: { creditLimit: number; standardDiscount: number; channelType: ChannelCode; creditTermDays: number },
  ) => Result;
  updateCustomerProfile: (customerId: string, profile: CustomerProfileInput) => Result;
  /** The text details only; images and opening balances have their own commands. */
  updateCompanyProfile: (
    profile: Pick<CompanyProfile, "name" | "taxId" | "branch" | "address" | "phone" | "email"> &
      Partial<Pick<CompanyProfile, "bankName" | "bankBranch" | "bankAccountName" | "bankAccountNo" | "promptPayId">>,
  ) => Result;
  /** `appliesTo`: the order whose invoice is being paid (otherwise the oldest invoices are settled first). */
  recordPayment: (customerId: string, amount: number, method: PaymentMethod, reference: string, appliesTo?: string | null) => Result;
  saveExchangeRate: (rate: ExchangeRate) => Result;
  recordSupplierInvoice: (importOrderNo: string, supplierInvoiceNo: string, date: string) => Result;
  recordSupplierPayment: (invoiceDocNo: string, amount: number, rate: number, method: PaymentMethod, reference: string) => Result;
  updateDeliveryStatus: (orderNo: string, status: DeliveryStatus) => Result;
  scheduleDelivery: (orderNo: string, date: string) => Result;
  returnSalesLines: (orderNo: string, returns: { line: number; quantity: number }[], reason: string) => Result;
  /** One entry per order line, in line order. */
  editSalesOrder: (orderNo: string, terms: SalesOrderTerms[]) => Result;
  adjustInventory: (lotBatch: string, patch: InventoryAdjustment, reason: string) => Result;

  createSalesOrder: (input: NewSalesOrderInput) => Result<{ order?: SalesOrder }>;
  approveSalesOrder: (orderNo: string) => Result;
  rejectSalesOrderApproval: (orderNo: string, reason: string) => Result;

  createImportOrder: (input: NewImportOrderInput) => Result<{ order?: ImportOrder }>;
  correctImportOrderLines: (orderNo: string, lineItems: ImportOrderLineItem[]) => Result;
  approveImportOrder: (orderNo: string) => Result;
  rejectImportOrder: (orderNo: string, reason: string) => Result;
  receiveGoods: (input: ReceiveGoodsInput) => Result;
  /** FR-06: uploads the file to the server and attaches it to the order. */
  attachDocument: (orderNo: string, file: File, kind: DocumentKind) => Result;
  removeDocument: (orderNo: string, docId: string) => Result;

  setOpeningBalances: (openingDate: string, openingBank: number) => Result;
  setCompanyImage: (kind: "logo" | "signature" | "stamp", dataUrl: string) => Result;
  addOpeningReceivable: (input: OpeningReceivableInput) => Result;
  addOpeningStock: (input: OpeningStockInput) => Result;
  addOpeningPayable: (input: OpeningPayableInput) => Result;
  setPrintSignature: (on: boolean) => Result;
  closePeriod: (through: string) => Result;
  reopenPeriod: (reason: string) => Result;
  recordExpense: (input: ExpenseInput) => Result<{ docNo?: string }>;
  remitWithholding: (month: string, reference: string) => Result;
  postJournal: (input: JournalInput) => Result<{ entryNo?: string }>;
  reverseJournal: (entryNo: string, reason: string) => Result;
  importBankLines: (lines: BankLineInput[]) => Result<{ added?: number; skipped?: number; matched?: number }>;
  autoMatchBank: () => Result<{ matched?: number }>;
  matchBankLine: (lineId: string, entryId: string) => Result;
  unmatchBankLine: (lineId: string) => Result;
  deleteBankLine: (lineId: string) => Result;
  createQuotation: (input: QuotationInput) => Result<{ quoteNo?: string }>;
  declineQuotation: (quoteNo: string, reason: string) => Result;
  convertQuotation: (quoteNo: string, plannedDeliveryDate?: string) => Result<{ order?: SalesOrder }>;
  createPurchaseRequest: (input: PurchaseRequestInput) => Result<{ requestNo?: string }>;
  decidePurchaseRequest: (requestNo: string, approve: boolean, note: string) => Result;
  recordReminder: (customerId: string, level: number, note: Bilingual | string) => Result;
  startStockCount: (warehouse: string, note: string) => Result<{ countNo?: string }>;
  enterStockCount: (countNo: string, counts: { lotBatch: string; counted: number | null }[]) => Result;
  postStockCount: (countNo: string) => Result;
  cancelStockCount: (countNo: string) => Result;

  /** Demo mode only: restores the original demo dataset on the server. */
  resetDemoData: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

interface CommandResponse {
  result: ActionResult & { order?: never };
  state?: ClientState;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { identity } = useRole();
  const { t } = useLanguage();
  const [store, setStoreRaw] = useState<ClientState | null>(null);
  const [version, setVersion] = useState(0);
  const setStore = useCallback((s: ClientState) => {
    setStoreRaw(s);
    setVersion((v) => v + 1);
  }, []);
  const [loadError, setLoadError] = useState(false);

  // What a user may see depends on their role (prices are masked on the server), so reload on switch.
  useEffect(() => {
    let cancelled = false;
    api<ClientState>("/api/state").then(
      (s) => {
        if (cancelled) return;
        setStore(s);
        setLoadError(false);
      },
      () => !cancelled && setLoadError(true),
    );
    return () => {
      cancelled = true;
    };
  }, [identity.key, setStore]);

  /** Runs a server command; the response carries the new state, so the screen never drifts from the database. */
  const command = useCallback(async (name: string, ...args: unknown[]) => {
    const res = await asResult(api<CommandResponse>(`/api/commands/${name}`, { method: "POST", body: { args } }));
    if (res.state) setStore(res.state);
    return res.result;
  }, [setStore]);

  const attachDocument = useCallback(async (orderNo: string, file: File, kind: DocumentKind) => {
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    const res = await asResult(api<CommandResponse>(`/api/import-orders/${encodeURIComponent(orderNo)}/documents`, { method: "POST", body: form }));
    if (res.state) setStore(res.state);
    return res.result;
  }, [setStore]);

  const resetDemoData = useCallback(async () => {
    const res = await asResult(api<CommandResponse>("/api/admin/reset", { method: "POST" }));
    if (res.state) setStore(res.state);
  }, [setStore]);

  const value = useMemo<DataContextValue | null>(() => {
    if (!store) return null;
    const c =
      <A extends unknown[], T = object>(name: string) =>
      (...args: A) =>
        command(name, ...args) as Result<T>;
    return {
      ...store,
      version,
      createProduct: c("createProduct"),
      createCustomer: c("createCustomer"),
      createLicense: c("createLicense"),
      saveSupplier: c("saveSupplier"),
      saveWarehouse: c("saveWarehouse"),
      updatePriceList: c("updatePriceList"),
      setPriceOverride: c("setPriceOverride"),
      updateTaxSettings: c("updateTaxSettings"),
      saveReorderPolicy: c("saveReorderPolicy"),
      updateProduct: c("updateProduct"),
      updateImportOrder: c("updateImportOrder"),
      recordCustomsClearance: c("recordCustomsClearance"),
      updateLicense: c("updateLicense"),
      updateCustomerTerms: c("updateCustomerTerms"),
      updateCustomerProfile: c("updateCustomerProfile"),
      updateCompanyProfile: c("updateCompanyProfile"),
      recordPayment: c("recordPayment"),
      saveExchangeRate: c("saveExchangeRate"),
      recordSupplierInvoice: c("recordSupplierInvoice"),
      recordSupplierPayment: c("recordSupplierPayment"),
      updateDeliveryStatus: c("updateDeliveryStatus"),
      scheduleDelivery: c("scheduleDelivery"),
      returnSalesLines: c("returnSalesLines"),
      editSalesOrder: c("editSalesOrder"),
      adjustInventory: c("adjustInventory"),
      createSalesOrder: c<[NewSalesOrderInput], { order?: SalesOrder }>("createSalesOrder"),
      approveSalesOrder: c("approveSalesOrder"),
      rejectSalesOrderApproval: c("rejectSalesOrderApproval"),
      createImportOrder: c<[NewImportOrderInput], { order?: ImportOrder }>("createImportOrder"),
      correctImportOrderLines: c("correctImportOrderLines"),
      approveImportOrder: c("approveImportOrder"),
      rejectImportOrder: c("rejectImportOrder"),
      receiveGoods: c("receiveGoods"),
      attachDocument,
      removeDocument: c("removeDocument"),
      setOpeningBalances: c("setOpeningBalances"),
      setCompanyImage: c("setCompanyImage"),
      addOpeningReceivable: c("addOpeningReceivable"),
      addOpeningStock: c("addOpeningStock"),
      addOpeningPayable: c("addOpeningPayable"),
      setPrintSignature: c("setPrintSignature"),
      closePeriod: c("closePeriod"),
      reopenPeriod: c("reopenPeriod"),
      recordExpense: c("recordExpense"),
      remitWithholding: c("remitWithholding"),
      postJournal: c("postJournal"),
      reverseJournal: c("reverseJournal"),
      importBankLines: c("importBankLines"),
      autoMatchBank: c("autoMatchBank"),
      matchBankLine: c("matchBankLine"),
      unmatchBankLine: c("unmatchBankLine"),
      deleteBankLine: c("deleteBankLine"),
      createQuotation: c("createQuotation"),
      declineQuotation: c("declineQuotation"),
      convertQuotation: c("convertQuotation"),
      createPurchaseRequest: c("createPurchaseRequest"),
      decidePurchaseRequest: c("decidePurchaseRequest"),
      recordReminder: c("recordReminder"),
      startStockCount: c("startStockCount"),
      enterStockCount: c("enterStockCount"),
      postStockCount: c("postStockCount"),
      cancelStockCount: c("cancelStockCount"),
      resetDemoData,
    };
  }, [store, version, command, attachDocument, resetDemoData]);

  if (!value)
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-gray-500">
        {loadError ? t("auth.serverUnreachable") : t("auth.loading")}
      </div>
    );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
