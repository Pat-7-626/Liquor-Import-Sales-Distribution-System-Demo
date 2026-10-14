export type ProductStatus = "available" | "lowStock" | "outOfStock";
export type ImportOrderStatus =
  | "staging"
  | "pendingApproval"
  | "approved"
  | "customsCleared"
  | "receivedWarehouse"
  | "issueDetected"
  | "rejected";
export type LicenseCategory = "import" | "sales";
export type LicenseStatus = "expired" | "expiringSoon" | "normal";
export type CreditStatus = "normal" | "nearLimit" | "overLimit" | "noLicense";
export type DeliveryStatus = "delivered" | "inDelivery" | "pendingShipment" | "returned" | "damaged";
export type InventoryStatus = "normal" | "agingStart" | "agingLong";

export type CategoryCode = "whisky" | "tequila" | "redWine" | "whiteWine" | "vodka" | "gin" | "liqueur" | "rum" | "beer";
export type UnitCode = "bottle" | "pack";
export type CountryCode = "scotland" | "mexico" | "france" | "sweden" | "uk" | "jamaica" | "japan";
export type ChannelCode = "distributor" | "retailWholesale" | "restaurantBar" | "online";
/** Warehouse Master code (e.g. "whA") — warehouses are master data, not a fixed list. */
export type WarehouseCode = string;

/** A name/label that is originally Thai text — shown translated in EN mode. */
export interface Bilingual {
  th: string;
  en: string;
}

export interface Product {
  sku: string;
  name: string;
  category: CategoryCode;
  abv: number;
  packageSize: number;
  unit: UnitCode;
  costPrice: number;
  suggestedPrice: number;
  stockAvailable: number;
  status: ProductStatus;
  hsCode: string;
}

/** FR-08: registered label version history for a SKU. */
export interface ProductLabel {
  id: string;
  version: string;
  registeredDate: string;
  note: Bilingual;
}

export type DocumentKind = "invoice" | "packingList" | "billOfLading" | "importLicense" | "other";

/** FR-06: attached original documents. Session-only (object URL, not a real upload). */
export interface AttachedDocument {
  id: string;
  name: string;
  kind: DocumentKind;
  url: string;
  uploadedAt: string;
}

export interface ImportOrderLineItem {
  sku: string;
  abv: number;
  qty: number;
  unitPrice: number;
}

/** FR-10/11: computed per order from ABV, quantity, and HS Code-driven duty rate. */
export interface ImportTaxBreakdown {
  dutyRatePercent: number;
  importDuty: number;
  exciseTax: number;
  vat: number;
  totalTax: number;
  exciseStampCount: number;
}

/** Section 6.1: logistics + financial fields the data spec calls for. */
export interface ImportLogistics {
  manufacturerRegNo: string;
  blAwbNumber: string;
  origin: string;
  destination: string;
  currency: string;
  paymentTerms: string;
}

/** FR-13/14: goods-receiving record, one line per ordered SKU. */
export interface ReceivingLine {
  sku: string;
  orderedQty: number;
  receivedQty: number;
  lotBatch: string;
  exciseStampDate: string;
}
export interface ReceivingRecord {
  receivedDate: string;
  lines: ReceivingLine[];
  hasDiscrepancy: boolean;
  /** Freight, insurance and clearing paid for this shipment (baht) — part of the stock's landed cost. */
  additionalCostThb?: number;
}

/** Baht per one unit of a foreign currency, from a date until the next rate for that currency. */
export interface ExchangeRate {
  currency: string;
  effectiveDate: string;
  rate: number;
}

/** One step in an order's life: the stage it reached, when, and who moved it there. */
export interface StatusEvent {
  status: string;
  /** ISO timestamp; null when the time wasn't recorded (orders migrated from before history was kept). */
  at: string | null;
  actor: Bilingual;
}

export interface ImportOrder {
  orderNo: string;
  /** Supplier Master link; `supplier` keeps the name as printed on the order. */
  supplierId?: string;
  supplier: string;
  country: CountryCode;
  incoterms: string;
  orderDate: string;
  etaDate: string;
  skuCount: number;
  totalValue: number;
  status: ImportOrderStatus;
  approver: Bilingual | null;
  customsDeclarationNo: string | null;
  /** FR-09/§7.1: the import license this order is drawn against, checked for validity and coverage period. */
  importLicenseNo?: string | null;
  note?: Bilingual;
  lineItems?: ImportOrderLineItem[];
  logistics?: ImportLogistics;
  tax?: ImportTaxBreakdown;
  documents?: AttachedDocument[];
  receiving?: ReceivingRecord;
  /** FR-28: multi-level approval for high-value orders — first sign-off, awaiting a second, different supervisor. */
  firstApprover?: Bilingual | null;
  /** Segregation of duties: whoever raised the order can't also approve it. Absent on seed data. */
  createdBy?: Bilingual;
  /** Every stage the order has passed through, oldest first. */
  statusHistory?: StatusEvent[];
  /** Currency the supplier invoices in; line prices are in it. */
  currency?: string;
  /** Baht per one unit of `currency`, fixed when the order was placed. `totalValue` is in baht. */
  exchangeRate?: number;
}

export interface License {
  licenseNo: string;
  type: Bilingual;
  holder: Bilingual;
  category: LicenseCategory;
  issueDate: string;
  expiryDate: string;
  daysRemaining: number;
  status: LicenseStatus;
}

export interface Customer {
  customerId: string;
  name: Bilingual;
  /** 13-digit Thai taxpayer ID — required on a full tax invoice (Revenue Code §86/4). */
  taxId: string;
  /** "00000" = head office, otherwise the branch number printed on the tax invoice. */
  branch: string;
  address: Bilingual;
  /** Payment terms: invoices fall due this many days after they are issued. */
  creditTermDays: number;
  channelType: ChannelCode;
  licenseNo: string | null;
  licenseExpiry: string | null;
  creditLimit: number;
  outstandingBalance: number;
  creditRemaining: number;
  standardDiscount: number;
  creditStatus: CreditStatus;
}

/** FR-22/28: set only while an over-standard-discount or over-credit-limit order awaits/failed real supervisor review; absent = normal, booked order. */
export type SalesOrderApprovalStatus = "pendingApproval" | "rejected";

/** One product line of a sales order, picked from one lot. */
export interface SalesOrderLine {
  sku: string;
  lotBatch: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  /** quantity × unit price × (1 − discount), VAT-inclusive. */
  netValue: number;
  /** Landed cost per unit (baht) of the lot it was taken from, recorded at the sale. */
  unitCost?: number;
  /** Units the customer sent back after delivery (partial return). */
  returnedQuantity?: number;
}

export interface SalesOrder {
  orderNo: string;
  /** Stable link to the Customer Master — names are display-only and can change. */
  customerId: string;
  customerName: Bilingual;
  /** Booking date (ISO yyyy-mm-dd) — drives monthly reporting. */
  orderDate: string;
  lines: SalesOrderLine[];
  /** Order total — the sum of the lines' net values (VAT-inclusive). */
  netValue: number;
  /** Date the tax invoice was issued (booking, or approval for held orders). */
  invoiceDate?: string;
  /** Invoice date + the customer's credit terms. */
  dueDate?: string;
  deliveryStatus: DeliveryStatus;
  taxInvoiceNo: string;
  approver: Bilingual | null;
  deliveryNoteNo: string;
  channelType?: ChannelCode;
  approvalStatus?: SalesOrderApprovalStatus;
  approvalNote?: Bilingual;
  /** FR-28: why this order needed approval (over-standard discount and/or over-credit-limit). */
  approvalReason?: Bilingual;
  /** Segregation of duties: whoever raised the order can't also approve it. Absent on seed data. */
  createdBy?: Bilingual;
  /** VAT rate in force when the order was booked — an issued tax invoice never changes with later rate edits. */
  vatPercent?: number;
  /** When the goods are planned to reach the customer — what dispatch works to. */
  plannedDeliveryDate?: string;
  /** Every stage the order has passed through, oldest first. */
  statusHistory?: StatusEvent[];
  /**
   * The tax invoice as issued: lines, value and VAT rate when the sale was booked. Later edits and returns
   * are documented by credit/debit notes — the invoice itself never changes.
   */
  invoice?: { lines: SalesOrderLine[]; netValue: number; vatPercent: number };
}

export interface InventoryItem {
  sku: string;
  productName: string;
  lotBatch: string;
  receivedDate: string;
  quantityRemaining: number;
  ageDays: number;
  status: InventoryStatus;
  warehouse: WarehouseCode;
  exciseStampDate?: string;
  /** Landed cost per unit in baht: purchase price at the order's rate + duty + excise + freight share. */
  unitCost?: number;
}

export type AuditAction = "created" | "updated" | "approved" | "rejected" | "payment";
export type AuditEntityType =
  | "importOrder"
  | "salesOrder"
  | "product"
  | "license"
  | "customer"
  | "inventory"
  | "supplier"
  | "warehouse"
  | "priceList"
  | "taxSettings"
  | "reorderPolicy"
  | "company"
  | "user"
  | "exchangeRate"
  | "payable"
  | "expense"
  | "journal"
  | "period"
  | "bank"
  | "quotation"
  | "purchaseRequest";

/** BR-04 / FR-29: who approved, modified, or rejected each record, and when. */
export interface AuditEntry {
  id: string;
  timestamp: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  actor: Bilingual;
  summary: Bilingual;
  /** The summary mentions prices, credit, discounts, or payments — hidden from roles without price access (NFR-03). */
  sensitive?: boolean;
}

/** NFR-03: roles gate visibility of Price / Credit / Discount and approval actions. */
export type Role =
  | "seniorManager"
  | "orderOfficer"
  | "documentationOfficer"
  | "warehouseOfficer"
  | "taxOfficer"
  | "salesOfficer"
  | "distributionOfficer"
  | "supervisor"
  /** Read-only visitor: sees everything except prices/credit, can change nothing. */
  | "guest";

/** Operations gated by role (NFR-03) — separate from price visibility, which is `canViewSensitive`. */
export type Permission =
  | "createImportOrder"
  | "editImportOrder"
  | "manageImportDocuments"
  | "recordCustomsClearance"
  | "receiveGoods"
  | "createSalesOrder"
  | "editSalesOrder"
  | "updateDelivery"
  | "editProduct"
  | "editLicense"
  | "editCustomerTerms"
  | "recordPayment"
  | "adjustInventory"
  | "createCustomer"
  | "manageSuppliers"
  | "manageWarehouses"
  | "managePricing"
  | "manageTax"
  | "manageReorder"
  | "manageCompany"
  /** See who has access and with which role. */
  | "viewUsers"
  /** Create users, change roles, reset passwords, disable accounts. */
  | "manageUsers"
  /** Record supplier invoices and payments to suppliers. */
  | "managePayables"
  /** Set exchange rates. */
  | "manageRates"
  /** Record operating expenses and withholding tax, and remit it. */
  | "manageExpenses"
  /** Post manual journal entries. */
  | "postJournals"
  /** Close (and reopen) accounting months. */
  | "closePeriods"
  /** Import bank statements and match them to the books. */
  | "reconcileBank"
  /** Ask for stock to be bought. */
  | "requestPurchase"
  | "approve";

export interface Identity {
  key: string;
  role: Role;
  name: Bilingual;
}

// ───────────────────────────── Master data ─────────────────────────────

export interface Supplier {
  supplierId: string;
  name: string;
  country: CountryCode;
  manufacturerRegNo: string;
  origin: string;
  defaultIncoterms: string;
  currency: string;
  paymentTerms: string;
  /** Days after the invoice date that a supplier invoice falls due (0 = on receipt, e.g. L/C at sight). */
  paymentTermDays: number;
  contactEmail: string;
  active: boolean;
}

/**
 * Accounts payable: a supplier's invoice for a received import order, or a payment against one. Amounts are
 * in the supplier's currency; `amountThb` is fixed at the order's rate for invoices and at the day's rate
 * for payments (the difference is an exchange gain or loss).
 */
export interface ApDocument {
  docNo: string;
  type: "invoice" | "payment";
  supplierId: string;
  importOrderNo: string;
  /** The supplier's own invoice number (invoices) or bank/cheque reference (payments). */
  reference: string;
  date: string;
  /** Invoices only. */
  dueDate?: string;
  currency: string;
  amount: number;
  rate: number;
  amountThb: number;
  /** Payments only: the invoice paid. */
  appliesTo?: string;
  method?: PaymentMethod;
  actor: Bilingual;
}

export interface Warehouse {
  code: WarehouseCode;
  name: Bilingual;
  address: string;
  /** Capacity in units (bottles/packs) — used for utilisation on the Warehouses page. */
  capacity: number;
  /** Bonded warehouses hold goods before excise is paid. */
  bonded: boolean;
  active: boolean;
}

/** FR-26: one price list per sales channel — a % adjustment on the suggested price, plus fixed per-SKU prices. */
export interface PriceList {
  channel: ChannelCode;
  adjustmentPercent: number;
  /** SKU → fixed unit price that overrides the % rule for this channel. */
  overrides: Record<string, number>;
}

export interface DutyRate {
  hsPrefix: string;
  label: string;
  dutyPercent: number;
}

/** FR-10/11: rates used when an import order's taxes are calculated. Stored per order at the time, so a change applies to new orders only. */
export interface TaxSettings {
  vatPercent: number;
  exciseThbPerAbvLiter: number;
  defaultDutyPercent: number;
  dutyRates: DutyRate[];
}

export interface ReorderPolicy {
  sku: string;
  /** Reorder when available + inbound stock falls to or below this. */
  reorderPoint: number;
  reorderQty: number;
  preferredSupplierId: string | null;
}

// ───────────────────────────── Ledgers ─────────────────────────────

export type StockMovementType = "receipt" | "sale" | "return" | "adjustment";

/** Every change to a lot's quantity — the sum of a lot's movements equals its quantity on hand. */
export interface StockMovement {
  id: string;
  timestamp: string;
  type: StockMovementType;
  sku: string;
  lotBatch: string;
  warehouse: WarehouseCode;
  /** Signed: positive in, negative out. */
  quantity: number;
  /** Source document — order number, or the adjustment reason. */
  reference: string;
  actor: Bilingual;
}

export type PaymentMethod = "transfer" | "cheque" | "cash";
/** Receipts (payments in), credit notes (returns, damage, price reductions), debit notes (increases after invoicing). */
export type ArDocumentType = "payment" | "creditNote" | "debitNote" | "openingBalance";

/** Accounts receivable documents other than invoices: receipts (payments in) and credit notes (returns/damage). */
export interface ArDocument {
  docNo: string;
  type: ArDocumentType;
  customerId: string;
  date: string;
  amount: number;
  method?: PaymentMethod;
  /** Bank/cheque reference for payments; the sales order number for credit notes. */
  reference: string;
  actor: Bilingual;
  /** Opening balances only: when the amount brought forward falls due. */
  dueDate?: string;
  /** Credit/debit notes: why the invoiced value changed (printed on the note, Revenue Code s.86/9–10). */
  reason?: Bilingual;
  /** Credit/debit notes: the invoice's value before this change. */
  originalValue?: number;
  /** Payments only: the order whose invoice this payment was for (otherwise it settles the oldest first). */
  appliesTo?: string;
}

/**
 * An operating expense paid from the bank: rent, salaries, freight, fees… Services paid to a company or
 * person may have tax withheld (ภ.ง.ด.53 / ภ.ง.ด.3), which is owed to the Revenue Department instead.
 */
export interface Expense {
  docNo: string;
  date: string;
  payee: string;
  /** 13-digit taxpayer ID — needed on the withholding certificate when tax is withheld. */
  payeeTaxId: string;
  payeeType: "company" | "individual";
  /** Expense account (6xxx). */
  account: string;
  description: string;
  /** Before VAT. */
  amount: number;
  /** VAT on a tax invoice from the payee (reclaimable). */
  vat: number;
  /** Percent withheld from the amount before VAT (0, 1, 2, 3, 5). */
  whtRate: number;
  whtAmount: number;
  /** What actually left the bank: amount + VAT − withholding. */
  paid: number;
  method: PaymentMethod;
  reference: string;
  actor: Bilingual;
}

/** A journal entry posted by hand (accruals, corrections, owner's capital, tax remittances…). */
export interface ManualJournal {
  entryNo: string;
  date: string;
  memo: string;
  lines: { account: string; debit: number; credit: number }[];
  kind: "manual" | "whtRemittance";
  /** For a tax remittance: the month ("YYYY-MM") whose withholding it pays. */
  period?: string;
  /** For a correction: the entry it reverses. */
  reverses?: string;
  actor: Bilingual;
}

/** One line of an imported bank statement; matched to the book entry it corresponds to. */
export interface BankLine {
  id: string;
  date: string;
  description: string;
  /** Money in (+) or out (−). */
  amount: number;
  reference: string;
  matchedEntryId?: string;
}

export interface QuotationLine {
  sku: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  netValue: number;
}

/** A price offer to a customer; accepted, it becomes a sales order. Expired = still open past validUntil. */
export interface Quotation {
  quoteNo: string;
  customerId: string;
  customerName: Bilingual;
  date: string;
  validUntil: string;
  lines: QuotationLine[];
  netValue: number;
  status: "open" | "accepted" | "declined";
  salesOrderNo?: string;
  notes: string;
  createdBy: Bilingual;
}

/** Someone asks for stock to be bought; a supervisor approves; purchasing turns it into an import order. */
export interface PurchaseRequest {
  requestNo: string;
  date: string;
  sku: string;
  quantity: number;
  reason: string;
  preferredSupplierId: string | null;
  status: "pending" | "approved" | "rejected" | "ordered";
  requestedBy: Bilingual;
  decidedBy?: Bilingual;
  decisionNote?: string;
  importOrderNo?: string;
}

/** The selling company — printed as the seller on every tax invoice, receipt, and credit/debit note. */
export interface CompanyProfile {
  name: Bilingual;
  taxId: string;
  branch: string;
  address: Bilingual;
  phone: string;
  email: string;
  /** When the system's books start, and the cash in the bank on that day. */
  openingDate: string;
  openingBank: number;
  /** Accounting months up to and including this date are closed: nothing can be dated into them. */
  closedThrough?: string;
}
