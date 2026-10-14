import type {
  ApDocument,
  BankLine,
  Expense,
  ManualJournal,
  PurchaseRequest,
  Quotation,
  ArDocument,
  ExchangeRate,
  CompanyProfile,
  AuditEntry,
  Customer,
  ImportOrder,
  InventoryItem,
  License,
  PriceList,
  Product,
  ReorderPolicy,
  SalesOrder,
  StockMovement,
  Supplier,
  TaxSettings,
  Warehouse,
} from "../data/types";

/** Everything the system knows — the shape the API serves and the domain actions operate on. */
export interface Store {
  products: Product[];
  importOrders: ImportOrder[];
  licenses: License[];
  customers: Customer[];
  salesOrders: SalesOrder[];
  inventory: InventoryItem[];
  auditLog: AuditEntry[];
  suppliers: Supplier[];
  warehouses: Warehouse[];
  priceLists: PriceList[];
  taxSettings: TaxSettings;
  reorderPolicies: ReorderPolicy[];
  /** Stock ledger — every receipt, sale, return, and adjustment per lot. */
  stockMovements: StockMovement[];
  /** Receipts (customer payments), credit/debit notes, and opening balances. */
  arDocuments: ArDocument[];
  /** The seller printed on tax invoices and other documents. */
  company: CompanyProfile;
  /** Baht per unit of each foreign currency, with history. */
  exchangeRates: ExchangeRate[];
  /** Supplier invoices and payments to suppliers. */
  apDocuments: ApDocument[];
  expenses: Expense[];
  manualJournals: ManualJournal[];
  bankLines: BankLine[];
  quotations: Quotation[];
  purchaseRequests: PurchaseRequest[];
}

export const STORE_KEYS: (keyof Store)[] = [
  "products",
  "importOrders",
  "licenses",
  "customers",
  "salesOrders",
  "inventory",
  "auditLog",
  "suppliers",
  "warehouses",
  "priceLists",
  "taxSettings",
  "reorderPolicies",
  "stockMovements",
  "arDocuments",
  "company",
  "exchangeRates",
  "apDocuments",
  "expenses",
  "manualJournals",
  "bankLines",
  "quotations",
  "purchaseRequests",
];

export function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
