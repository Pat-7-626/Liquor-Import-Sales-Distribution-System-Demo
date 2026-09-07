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
export type WarehouseCode = "whA" | "whB" | "whC";

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
}

export interface ImportOrder {
  orderNo: string;
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

export interface SalesOrder {
  orderNo: string;
  customerName: Bilingual;
  sku: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  netValue: number;
  lotBatch: string;
  deliveryStatus: DeliveryStatus;
  taxInvoiceNo: string;
  approver: Bilingual | null;
  deliveryNoteNo: string;
  channelType?: ChannelCode;
  approvalStatus?: SalesOrderApprovalStatus;
  approvalNote?: Bilingual;
  /** FR-28: why this order needed approval (over-standard discount and/or over-credit-limit). */
  approvalReason?: Bilingual;
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
}

export type AuditAction = "created" | "updated" | "approved" | "rejected";
export type AuditEntityType = "importOrder" | "salesOrder" | "product" | "license" | "customer" | "inventory";

/** BR-04 / FR-29: who approved, modified, or rejected each record, and when. */
export interface AuditEntry {
  id: string;
  timestamp: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  actor: Bilingual;
  summary: Bilingual;
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
  | "supervisor";

export interface Identity {
  key: string;
  role: Role;
  name: Bilingual;
}
