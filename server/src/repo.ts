/**
 * Store <-> PostgreSQL. `loadStore` reads every table into the domain's Store shape; `saveStore` compares
 * a before/after snapshot and writes only what changed (upserts, plus child-row replacement for the
 * changed parents). Commands run load → action → save inside one locked transaction (see commands.ts).
 */
import type { JSONValue } from "postgres";
import type {
  StockCount,
  ArReminder,
  ApDocument,
  BankLine,
  Expense,
  ManualJournal,
  PurchaseRequest,
  Quotation,
  ExchangeRate,
  ArDocument,
  AuditEntry,
  CompanyProfile,
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
} from "../../src/data/types.ts";
import type { Store } from "../../src/domain/store.ts";
import { computeCreditStatus, computeLicenseStatus, computeInventoryAge } from "../../src/lib/business.ts";
import type { Sql, Tx } from "./db.ts";

/** A connection or a transaction — a transaction is a full Sql client too. */
type Db = Sql | Tx;
type Row = Record<string, unknown>;

/** Absent optional fields come back as null from SQL — strip them so objects match the domain shape. */
function clean<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === null || o[k] === undefined) delete o[k];
  return o;
}
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

// ───────────────────────────── load ─────────────────────────────

/**
 * `light`: leave out the stock ledger and the audit log — the two tables that grow without bound. Screens
 * read them a page at a time (see queries.ts); the domain actions always get everything.
 */
export async function loadStore(db: Db, opts: { light?: boolean } = {}): Promise<Store> {
  const none = Promise.resolve([] as Row[]);
  const [
    products,
    suppliers,
    warehouses,
    licenses,
    customers,
    priceLists,
    overrides,
    taxRows,
    dutyRates,
    reorder,
    imports,
    lines,
    docs,
    lots,
    sales,
    salesLines,
    moves,
    ar,
    audit,
    companyRows,
    rateRows,
    apRows,
    expenseRows,
    journalRows,
    bankRows,
    quoteRows,
    requestRows,
    reminderRows,
    countRows,
  ] = await Promise.all([
    db<Row[]>`select * from products order by sku`,
    db<Row[]>`select * from suppliers order by supplier_id`,
    db<Row[]>`select * from warehouses order by code`,
    db<Row[]>`select * from licenses order by license_no`,
    db<Row[]>`select * from customers order by customer_id`,
    db<Row[]>`select * from price_lists order by channel`,
    db<Row[]>`select * from price_list_overrides`,
    db<Row[]>`select * from tax_settings where id = 1`,
    db<Row[]>`select * from duty_rates order by sort_order`,
    db<Row[]>`select * from reorder_policies order by sku`,
    db<Row[]>`select * from import_orders order by order_date desc, order_no desc`,
    db<Row[]>`select * from import_order_lines order by order_no, line_no`,
    db<Row[]>`select * from import_order_documents order by order_no, sort_order`,
    db<Row[]>`select * from inventory_lots order by received_date desc, lot_batch`,
    db<Row[]>`select * from sales_orders order by order_no desc`,
    db<Row[]>`select * from sales_order_lines order by order_no, line_no`,
    opts.light ? none : db<Row[]>`select * from stock_movements order by ts desc, id`,
    db<Row[]>`select * from ar_documents order by date desc, doc_no desc`,
    opts.light ? none : db<Row[]>`select * from audit_log order by ts desc, id`,
    db<Row[]>`select * from company where id = 1`,
    db<Row[]>`select * from exchange_rates order by currency, effective_date`,
    db<Row[]>`select * from ap_documents order by date desc, doc_no desc`,
    db<Row[]>`select * from expenses order by date desc, doc_no desc`,
    db<Row[]>`select * from manual_journals order by date desc, entry_no desc`,
    db<Row[]>`select * from bank_lines order by date, id`,
    db<Row[]>`select * from quotations order by date desc, quote_no desc`,
    db<Row[]>`select * from purchase_requests order by date desc, request_no desc`,
    db<Row[]>`select * from ar_reminders order by date desc, id`,
    db<Row[]>`select * from stock_counts order by date desc, count_no desc`,
  ]);
  const co = companyRows[0];

  const tax = taxRows[0];
  const channelOrder = ["distributor", "retailWholesale", "restaurantBar", "online"];

  return {
    products: products.map(
      (r): Product => ({
        sku: r.sku as string,
        name: r.name as string,
        category: r.category as Product["category"],
        abv: r.abv as number,
        packageSize: r.package_size as number,
        unit: r.unit as Product["unit"],
        costPrice: r.cost_price as number,
        suggestedPrice: r.suggested_price as number,
        stockAvailable: r.stock_available as number,
        status: r.status as Product["status"],
        hsCode: r.hs_code as string,
      }),
    ),
    suppliers: suppliers.map(
      (r): Supplier => ({
        supplierId: r.supplier_id as string,
        name: r.name as string,
        country: r.country as Supplier["country"],
        manufacturerRegNo: r.manufacturer_reg_no as string,
        origin: r.origin as string,
        defaultIncoterms: r.default_incoterms as string,
        currency: r.currency as string,
        paymentTerms: r.payment_terms as string,
        paymentTermDays: r.payment_term_days as number,
        contactEmail: r.contact_email as string,
        active: r.active as boolean,
      }),
    ),
    warehouses: warehouses.map(
      (r): Warehouse => ({
        code: r.code as string,
        name: r.name as Warehouse["name"],
        address: r.address as string,
        capacity: r.capacity as number,
        bonded: r.bonded as boolean,
        active: r.active as boolean,
      }),
    ),
    licenses: licenses.map(
      (r): License => ({
        licenseNo: r.license_no as string,
        type: r.type as License["type"],
        holder: r.holder as License["holder"],
        category: r.category as License["category"],
        issueDate: r.issue_date as string,
        expiryDate: r.expiry_date as string,
        ...computeLicenseStatus(r.expiry_date as string),
      }),
    ),
    customers: customers.map((r): Customer => {
      const creditLimit = r.credit_limit as number;
      const outstandingBalance = r.outstanding_balance as number;
      return {
        customerId: r.customer_id as string,
        name: r.name as Customer["name"],
        taxId: r.tax_id as string,
        branch: r.branch as string,
        address: r.address as Customer["address"],
        email: (r.email as string) ?? "",
        creditTermDays: r.credit_term_days as number,
        channelType: r.channel_type as Customer["channelType"],
        licenseNo: (r.license_no as string | null) ?? null,
        licenseExpiry: (r.license_expiry as string | null) ?? null,
        creditLimit,
        outstandingBalance,
        standardDiscount: r.standard_discount as number,
        ...computeCreditStatus(creditLimit, outstandingBalance, r.license_no !== null),
      };
    }),
    priceLists: priceLists
      .map(
        (r): PriceList => ({
          channel: r.channel as PriceList["channel"],
          adjustmentPercent: r.adjustment_percent as number,
          overrides: Object.fromEntries(overrides.filter((o) => o.channel === r.channel).map((o) => [o.sku as string, o.price as number])),
        }),
      )
      .sort((a, b) => channelOrder.indexOf(a.channel) - channelOrder.indexOf(b.channel)),
    taxSettings: {
      vatPercent: tax?.vat_percent as number,
      exciseThbPerAbvLiter: tax?.excise_thb_per_abv_liter as number,
      defaultDutyPercent: tax?.default_duty_percent as number,
      dutyRates: dutyRates.map((d) => ({ hsPrefix: d.hs_prefix as string, label: d.label as string, dutyPercent: d.duty_percent as number })),
    },
    reorderPolicies: reorder.map(
      (r): ReorderPolicy => ({
        sku: r.sku as string,
        reorderPoint: r.reorder_point as number,
        reorderQty: r.reorder_qty as number,
        preferredSupplierId: (r.preferred_supplier_id as string | null) ?? null,
      }),
    ),
    importOrders: imports.map((r): ImportOrder => {
      const orderLines = lines.filter((l) => l.order_no === r.order_no);
      const orderDocs = docs.filter((d) => d.order_no === r.order_no);
      return clean({
        orderNo: r.order_no as string,
        supplierId: r.supplier_id as string | undefined,
        supplier: r.supplier as string,
        country: r.country as ImportOrder["country"],
        incoterms: r.incoterms as string,
        orderDate: r.order_date as string,
        etaDate: r.eta_date as string,
        skuCount: r.sku_count as number,
        totalValue: r.total_value as number,
        status: r.status as ImportOrder["status"],
        approver: (r.approver as ImportOrder["approver"]) ?? null,
        customsDeclarationNo: (r.customs_declaration_no as string | null) ?? null,
        importLicenseNo: r.import_license_no as string | undefined,
        note: r.note as ImportOrder["note"],
        lineItems: orderLines.map((l) => ({ sku: l.sku as string, abv: l.abv as number, qty: l.qty as number, unitPrice: l.unit_price as number })),
        logistics: r.logistics as ImportOrder["logistics"],
        tax: r.tax as ImportOrder["tax"],
        documents: orderDocs.length
          ? orderDocs.map((d) => ({ id: d.id as string, name: d.name as string, kind: d.kind as never, url: d.url as string, uploadedAt: iso(d.uploaded_at) }))
          : undefined,
        receiving: r.receiving as ImportOrder["receiving"],
        firstApprover: r.first_approver as ImportOrder["firstApprover"],
        createdBy: r.created_by as ImportOrder["createdBy"],
        statusHistory: (r.status_history as ImportOrder["statusHistory"]) ?? [],
        currency: r.currency as string,
        exchangeRate: r.exchange_rate as number,
      }) as ImportOrder;
    }),
    inventory: lots.map((r): InventoryItem =>
      clean({
        sku: r.sku as string,
        productName: r.product_name as string,
        lotBatch: r.lot_batch as string,
        receivedDate: r.received_date as string,
        quantityRemaining: r.quantity_remaining as number,
        ...computeInventoryAge(r.received_date as string),
        warehouse: r.warehouse as string,
        exciseStampDate: r.excise_stamp_date as string | undefined,
        unitCost: r.unit_cost as number | undefined,
      }),
    ),
    salesOrders: sales.map((r): SalesOrder =>
      clean({
        orderNo: r.order_no as string,
        customerId: r.customer_id as string,
        customerName: r.customer_name as SalesOrder["customerName"],
        orderDate: r.order_date as string,
        invoiceDate: r.invoice_date as string | undefined,
        dueDate: r.due_date as string | undefined,
        channelType: r.channel_type as SalesOrder["channelType"],
        lines: salesLines
          .filter((l) => l.order_no === r.order_no)
          .map((l) => ({
            sku: l.sku as string,
            lotBatch: l.lot_batch as string,
            quantity: l.quantity as number,
            unitPrice: l.unit_price as number,
            discountPercent: l.discount_percent as number,
            netValue: l.net_value as number,
            ...(l.unit_cost !== null ? { unitCost: l.unit_cost as number } : {}),
            ...((l.returned_quantity as number) > 0 ? { returnedQuantity: l.returned_quantity as number } : {}),
          })),
        netValue: r.net_value as number,
        deliveryStatus: r.delivery_status as SalesOrder["deliveryStatus"],
        taxInvoiceNo: r.tax_invoice_no as string,
        deliveryNoteNo: r.delivery_note_no as string,
        vatPercent: r.vat_percent as number | undefined,
        approver: (r.approver as SalesOrder["approver"]) ?? null,
        approvalStatus: r.approval_status as SalesOrder["approvalStatus"],
        approvalNote: r.approval_note as SalesOrder["approvalNote"],
        approvalReason: r.approval_reason as SalesOrder["approvalReason"],
        createdBy: r.created_by as SalesOrder["createdBy"],
        statusHistory: (r.status_history as SalesOrder["statusHistory"]) ?? [],
        plannedDeliveryDate: (r.planned_delivery_date as string | null) ?? undefined,
        invoice: (r.invoice as SalesOrder["invoice"]) ?? undefined,
      }) as SalesOrder,
    ),
    stockMovements: moves.map(movementFromRow),
    arDocuments: ar.map((r): ArDocument =>
      clean({
        docNo: r.doc_no as string,
        type: r.type as ArDocument["type"],
        customerId: r.customer_id as string,
        date: r.date as string,
        amount: r.amount as number,
        method: r.method as ArDocument["method"],
        reference: r.reference as string,
        actor: r.actor as ArDocument["actor"],
        dueDate: r.due_date as string | undefined,
        reason: (r.reason as ArDocument["reason"]) ?? undefined,
        originalValue: (r.original_value as number | null) ?? undefined,
        appliesTo: (r.applies_to as string | null) ?? undefined,
      }),
    ),
    exchangeRates: rateRows.map((r): ExchangeRate => ({ currency: r.currency as string, effectiveDate: r.effective_date as string, rate: r.rate as number })),
    apDocuments: apRows.map(
      (r): ApDocument =>
        clean({
          docNo: r.doc_no as string,
          type: r.type as ApDocument["type"],
          supplierId: r.supplier_id as string,
          importOrderNo: r.import_order_no as string,
          reference: r.reference as string,
          date: r.date as string,
          dueDate: r.due_date as string | undefined,
          currency: r.currency as string,
          amount: r.amount as number,
          rate: r.rate as number,
          amountThb: r.amount_thb as number,
          appliesTo: r.applies_to as string | undefined,
          method: r.method as ApDocument["method"],
          actor: r.actor as ApDocument["actor"],
        }) as ApDocument,
    ),
    company: {
      name: (co?.name as CompanyProfile["name"]) ?? { th: "", en: "" },
      taxId: (co?.tax_id as string) ?? "",
      branch: (co?.branch as string) ?? "00000",
      address: (co?.address as CompanyProfile["address"]) ?? { th: "", en: "" },
      phone: (co?.phone as string) ?? "",
      email: (co?.email as string) ?? "",
      openingDate: (co?.opening_date as string) ?? "2026-04-30",
      openingBank: (co?.opening_bank as number) ?? 0,
      ...(co?.closed_through ? { closedThrough: co.closed_through as string } : {}),
      bankName: (co?.bank_name as string) ?? "",
      bankBranch: (co?.bank_branch as string) ?? "",
      bankAccountName: (co?.bank_account_name as string) ?? "",
      bankAccountNo: (co?.bank_account_no as string) ?? "",
      promptPayId: (co?.promptpay_id as string) ?? "",
      logo: (co?.logo as string) ?? "",
      signature: (co?.signature as string) ?? "",
      stamp: (co?.stamp as string) ?? "",
      printSignature: Boolean(co?.print_signature),
    },
    expenses: expenseRows.map(
      (r): Expense => ({
        docNo: r.doc_no as string,
        date: r.date as string,
        payee: r.payee as string,
        payeeTaxId: r.payee_tax_id as string,
        payeeType: r.payee_type as Expense["payeeType"],
        account: r.account as string,
        description: r.description as string,
        amount: r.amount as number,
        vat: r.vat as number,
        whtRate: r.wht_rate as number,
        whtAmount: r.wht_amount as number,
        paid: r.paid as number,
        method: r.method as Expense["method"],
        reference: r.reference as string,
        actor: r.actor as Expense["actor"],
      }),
    ),
    manualJournals: journalRows.map(
      (r): ManualJournal =>
        clean({
          entryNo: r.entry_no as string,
          date: r.date as string,
          memo: r.memo as string,
          lines: r.lines as ManualJournal["lines"],
          kind: r.kind as ManualJournal["kind"],
          period: r.period as string | undefined,
          reverses: r.reverses as string | undefined,
          actor: r.actor as ManualJournal["actor"],
        }),
    ),
    bankLines: bankRows.map(
      (r): BankLine =>
        clean({
          id: r.id as string,
          date: r.date as string,
          description: r.description as string,
          amount: r.amount as number,
          reference: r.reference as string,
          matchedEntryId: r.matched_entry_id as string | undefined,
        }),
    ),
    quotations: quoteRows.map(
      (r): Quotation =>
        clean({
          quoteNo: r.quote_no as string,
          customerId: r.customer_id as string,
          customerName: r.customer_name as Quotation["customerName"],
          date: r.date as string,
          validUntil: r.valid_until as string,
          lines: r.lines as Quotation["lines"],
          netValue: r.net_value as number,
          status: r.status as Quotation["status"],
          salesOrderNo: r.sales_order_no as string | undefined,
          notes: r.notes as string,
          createdBy: r.created_by as Quotation["createdBy"],
        }),
    ),
    stockCounts: countRows.map(
      (r): StockCount =>
        clean({
          countNo: r.count_no as string,
          warehouse: r.warehouse as StockCount["warehouse"],
          date: r.date as string,
          status: r.status as StockCount["status"],
          lines: r.lines as StockCount["lines"],
          note: r.note as string,
          createdBy: r.created_by as StockCount["createdBy"],
          postedBy: r.posted_by as StockCount["postedBy"],
          postedOn: r.posted_on as string | undefined,
        }),
    ),
    arReminders: reminderRows.map(
      (r): ArReminder => ({
        id: r.id as string,
        customerId: r.customer_id as string,
        date: r.date as string,
        level: r.level as ArReminder["level"],
        overdueAmount: r.overdue_amount as number,
        note: r.note as string,
        actor: r.actor as ArReminder["actor"],
      }),
    ),
    purchaseRequests: requestRows.map(
      (r): PurchaseRequest =>
        clean({
          requestNo: r.request_no as string,
          date: r.date as string,
          sku: r.sku as string,
          quantity: r.quantity as number,
          reason: r.reason as string,
          preferredSupplierId: (r.preferred_supplier_id as string | null) ?? null,
          status: r.status as PurchaseRequest["status"],
          requestedBy: r.requested_by as PurchaseRequest["requestedBy"],
          decidedBy: r.decided_by as PurchaseRequest["decidedBy"],
          decisionNote: r.decision_note as string | undefined,
          importOrderNo: r.import_order_no as string | undefined,
        }),
    ),
    auditLog: audit.map(auditFromRow),
  };
}

export const movementFromRow = (r: Row): StockMovement => ({
  id: r.id as string,
  timestamp: iso(r.ts),
  type: r.type as StockMovement["type"],
  sku: r.sku as string,
  lotBatch: r.lot_batch as string,
  warehouse: r.warehouse as string,
  quantity: r.quantity as number,
  reference: r.reference as string,
  actor: r.actor as StockMovement["actor"],
});

export const auditFromRow = (r: Row): AuditEntry =>
  clean({
    id: r.id as string,
    timestamp: iso(r.ts),
    entityType: r.entity_type as AuditEntry["entityType"],
    entityId: r.entity_id as string,
    action: r.action as AuditEntry["action"],
    actor: r.actor as AuditEntry["actor"],
    summary: r.summary as AuditEntry["summary"],
    sensitive: (r.sensitive as boolean) || undefined,
  });

// ───────────────────────────── rows ─────────────────────────────

const json = (db: Db, v: unknown) => (v === undefined || v === null ? null : db.json(v as JSONValue));

const productRow = (p: Product) => ({
  sku: p.sku,
  name: p.name,
  category: p.category,
  abv: p.abv,
  package_size: p.packageSize,
  unit: p.unit,
  cost_price: p.costPrice,
  suggested_price: p.suggestedPrice,
  stock_available: p.stockAvailable,
  status: p.status,
  hs_code: p.hsCode,
});
const supplierRow = (s: Supplier) => ({
  supplier_id: s.supplierId,
  name: s.name,
  country: s.country,
  manufacturer_reg_no: s.manufacturerRegNo,
  origin: s.origin,
  default_incoterms: s.defaultIncoterms,
  currency: s.currency,
  payment_terms: s.paymentTerms,
  payment_term_days: s.paymentTermDays ?? 0,
  contact_email: s.contactEmail,
  active: s.active,
});
const warehouseRow = (db: Db, w: Warehouse) => ({
  code: w.code,
  name: json(db, w.name),
  address: w.address,
  capacity: w.capacity,
  bonded: w.bonded,
  active: w.active,
});
const licenseRow = (db: Db, l: License) => ({
  license_no: l.licenseNo,
  type: json(db, l.type),
  holder: json(db, l.holder),
  category: l.category,
  issue_date: l.issueDate,
  expiry_date: l.expiryDate,
});
const customerRow = (db: Db, c: Customer) => ({
  customer_id: c.customerId,
  name: json(db, c.name),
  tax_id: c.taxId,
  branch: c.branch,
  address: json(db, c.address),
  email: c.email ?? "",
  credit_term_days: c.creditTermDays,
  channel_type: c.channelType,
  license_no: c.licenseNo,
  license_expiry: c.licenseExpiry,
  credit_limit: c.creditLimit,
  outstanding_balance: c.outstandingBalance,
  standard_discount: c.standardDiscount,
});
const reorderRow = (r: ReorderPolicy) => ({
  sku: r.sku,
  reorder_point: r.reorderPoint,
  reorder_qty: r.reorderQty,
  preferred_supplier_id: r.preferredSupplierId,
});
const importRow = (db: Db, o: ImportOrder) => ({
  order_no: o.orderNo,
  supplier_id: o.supplierId ?? null,
  supplier: o.supplier,
  country: o.country,
  incoterms: o.incoterms,
  order_date: o.orderDate,
  eta_date: o.etaDate,
  sku_count: o.skuCount,
  total_value: o.totalValue,
  status: o.status,
  approver: json(db, o.approver),
  first_approver: json(db, o.firstApprover),
  created_by: json(db, o.createdBy),
  customs_declaration_no: o.customsDeclarationNo,
  import_license_no: o.importLicenseNo ?? null,
  note: json(db, o.note),
  logistics: json(db, o.logistics),
  tax: json(db, o.tax),
  receiving: json(db, o.receiving),
  status_history: json(db, o.statusHistory ?? []),
  currency: o.currency ?? "THB",
  exchange_rate: o.exchangeRate ?? 1,
});
const lotRow = (i: InventoryItem) => ({
  lot_batch: i.lotBatch,
  sku: i.sku,
  product_name: i.productName,
  received_date: i.receivedDate,
  quantity_remaining: i.quantityRemaining,
  warehouse: i.warehouse,
  excise_stamp_date: i.exciseStampDate ?? null,
  unit_cost: i.unitCost ?? null,
});
const salesRow = (db: Db, o: SalesOrder) => ({
  order_no: o.orderNo,
  customer_id: o.customerId,
  customer_name: json(db, o.customerName),
  order_date: o.orderDate,
  invoice_date: o.invoiceDate ?? null,
  due_date: o.dueDate ?? null,
  channel_type: o.channelType ?? null,
  net_value: o.netValue,
  delivery_status: o.deliveryStatus,
  tax_invoice_no: o.taxInvoiceNo,
  delivery_note_no: o.deliveryNoteNo,
  vat_percent: o.vatPercent ?? null,
  approver: json(db, o.approver),
  approval_status: o.approvalStatus ?? null,
  approval_note: json(db, o.approvalNote),
  approval_reason: json(db, o.approvalReason),
  created_by: json(db, o.createdBy),
  status_history: json(db, o.statusHistory ?? []),
  planned_delivery_date: o.plannedDeliveryDate ?? null,
  invoice: json(db, o.invoice),
});
const movementRow = (db: Db, m: StockMovement) => ({
  id: m.id,
  ts: m.timestamp,
  type: m.type,
  sku: m.sku,
  lot_batch: m.lotBatch,
  warehouse: m.warehouse,
  quantity: m.quantity,
  reference: m.reference,
  actor: json(db, m.actor),
});
const arRow = (db: Db, d: ArDocument) => ({
  doc_no: d.docNo,
  type: d.type,
  customer_id: d.customerId,
  date: d.date,
  amount: d.amount,
  method: d.method ?? null,
  reference: d.reference,
  actor: json(db, d.actor),
  due_date: d.dueDate ?? null,
  reason: d.reason ? json(db, d.reason) : null,
  original_value: d.originalValue ?? null,
  applies_to: d.appliesTo ?? null,
});
const apRow = (db: Db, d: ApDocument) => ({
  doc_no: d.docNo,
  type: d.type,
  supplier_id: d.supplierId,
  import_order_no: d.importOrderNo,
  reference: d.reference,
  date: d.date,
  due_date: d.dueDate ?? null,
  currency: d.currency,
  amount: d.amount,
  rate: d.rate,
  amount_thb: d.amountThb,
  applies_to: d.appliesTo ?? null,
  method: d.method ?? null,
  actor: json(db, d.actor),
});
const expenseRow = (db: Db, x: Expense) => ({
  doc_no: x.docNo,
  date: x.date,
  payee: x.payee,
  payee_tax_id: x.payeeTaxId,
  payee_type: x.payeeType,
  account: x.account,
  description: x.description,
  amount: x.amount,
  vat: x.vat,
  wht_rate: x.whtRate,
  wht_amount: x.whtAmount,
  paid: x.paid,
  method: x.method,
  reference: x.reference,
  actor: json(db, x.actor),
});
const journalRow = (db: Db, j: ManualJournal) => ({
  entry_no: j.entryNo,
  date: j.date,
  memo: j.memo,
  lines: json(db, j.lines),
  kind: j.kind,
  period: j.period ?? null,
  reverses: j.reverses ?? null,
  actor: json(db, j.actor),
});
const bankLineRow = (l: BankLine) => ({
  id: l.id,
  date: l.date,
  description: l.description,
  amount: l.amount,
  reference: l.reference,
  matched_entry_id: l.matchedEntryId ?? null,
});
const quotationRow = (db: Db, q: Quotation) => ({
  quote_no: q.quoteNo,
  customer_id: q.customerId,
  customer_name: json(db, q.customerName),
  date: q.date,
  valid_until: q.validUntil,
  lines: json(db, q.lines),
  net_value: q.netValue,
  status: q.status,
  sales_order_no: q.salesOrderNo ?? null,
  notes: q.notes,
  created_by: json(db, q.createdBy),
});
const requestRow = (db: Db, r: PurchaseRequest) => ({
  request_no: r.requestNo,
  date: r.date,
  sku: r.sku,
  quantity: r.quantity,
  reason: r.reason,
  preferred_supplier_id: r.preferredSupplierId,
  status: r.status,
  requested_by: json(db, r.requestedBy),
  decided_by: json(db, r.decidedBy),
  decision_note: r.decisionNote ?? null,
  import_order_no: r.importOrderNo ?? null,
});
const auditRow = (db: Db, e: AuditEntry) => ({
  id: e.id,
  ts: e.timestamp,
  entity_type: e.entityType,
  entity_id: e.entityId,
  action: e.action,
  actor: json(db, e.actor),
  summary: json(db, e.summary),
  sensitive: Boolean(e.sensitive),
});

// ───────────────────────────── save ─────────────────────────────

async function upsert(db: Db, table: string, key: string[], rows: Row[]) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const updates = cols.filter((c) => !key.includes(c)).map((c) => `${c} = excluded.${c}`);
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await db`
      insert into ${db(table)} ${db(chunk as never, cols)}
      on conflict (${db.unsafe(key.join(", "))})
      ${updates.length ? db.unsafe(`do update set ${updates.join(", ")}`) : db.unsafe("do nothing")}
    `;
  }
}

/** Items of `after` that are new or differ from `before`, matched by key. */
function changed<T>(before: T[], after: T[], key: (t: T) => string): T[] {
  const prev = new Map(before.map((b) => [key(b), JSON.stringify(b)]));
  return after.filter((a) => prev.get(key(a)) !== JSON.stringify(a));
}
function removed<T>(before: T[], after: T[], key: (t: T) => string): string[] {
  const now = new Set(after.map(key));
  return before.map(key).filter((k) => !now.has(k));
}

/**
 * Writes the difference between two snapshots. Parents are written before children and referenced rows
 * before referencing ones, so foreign keys hold at every statement.
 */
export async function saveStore(db: Db, before: Store, after: Store) {
  await upsert(db, "suppliers", ["supplier_id"], changed(before.suppliers, after.suppliers, (s) => s.supplierId).map(supplierRow));
  await upsert(db, "warehouses", ["code"], changed(before.warehouses, after.warehouses, (w) => w.code).map((w) => warehouseRow(db, w)));
  await upsert(db, "licenses", ["license_no"], changed(before.licenses, after.licenses, (l) => l.licenseNo).map((l) => licenseRow(db, l)));
  await upsert(db, "products", ["sku"], changed(before.products, after.products, (p) => p.sku).map(productRow));
  await upsert(db, "customers", ["customer_id"], changed(before.customers, after.customers, (c) => c.customerId).map((c) => customerRow(db, c)));

  for (const list of changed(before.priceLists, after.priceLists, (l) => l.channel)) {
    await upsert(db, "price_lists", ["channel"], [{ channel: list.channel, adjustment_percent: list.adjustmentPercent }]);
    await db`delete from price_list_overrides where channel = ${list.channel}`;
    const rows = Object.entries(list.overrides).map(([sku, price]) => ({ channel: list.channel, sku, price }));
    await upsert(db, "price_list_overrides", ["channel", "sku"], rows);
  }

  if (JSON.stringify(before.company) !== JSON.stringify(after.company)) {
    const c = after.company;
    await upsert(db, "company", ["id"], [
      {
        id: 1,
        name: json(db, c.name),
        tax_id: c.taxId,
        branch: c.branch,
        address: json(db, c.address),
        phone: c.phone,
        email: c.email,
        opening_date: c.openingDate,
        opening_bank: c.openingBank,
        closed_through: c.closedThrough ?? null,
        bank_name: c.bankName ?? "",
        bank_branch: c.bankBranch ?? "",
        bank_account_name: c.bankAccountName ?? "",
        bank_account_no: c.bankAccountNo ?? "",
        promptpay_id: c.promptPayId ?? "",
        logo: c.logo ?? "",
        signature: c.signature ?? "",
        stamp: c.stamp ?? "",
        print_signature: Boolean(c.printSignature),
      },
    ]);
  }

  if (JSON.stringify(before.taxSettings) !== JSON.stringify(after.taxSettings)) {
    await saveTaxSettings(db, after.taxSettings);
  }

  await upsert(db, "reorder_policies", ["sku"], changed(before.reorderPolicies, after.reorderPolicies, (r) => r.sku).map(reorderRow));

  for (const o of changed(before.importOrders, after.importOrders, (x) => x.orderNo)) {
    await upsert(db, "import_orders", ["order_no"], [importRow(db, o)]);
    await db`delete from import_order_lines where order_no = ${o.orderNo}`;
    await upsert(
      db,
      "import_order_lines",
      ["order_no", "line_no"],
      (o.lineItems ?? []).map((l, i) => ({ order_no: o.orderNo, line_no: i + 1, sku: l.sku, abv: l.abv, qty: l.qty, unit_price: l.unitPrice })),
    );
    await db`delete from import_order_documents where order_no = ${o.orderNo}`;
    await upsert(
      db,
      "import_order_documents",
      ["id"],
      (o.documents ?? []).map((d, i) => ({ id: d.id, order_no: o.orderNo, name: d.name, kind: d.kind, url: d.url, uploaded_at: d.uploadedAt, sort_order: i })),
    );
  }

  await upsert(db, "inventory_lots", ["lot_batch"], changed(before.inventory, after.inventory, (i) => i.lotBatch).map(lotRow));
  for (const o of changed(before.salesOrders, after.salesOrders, (x) => x.orderNo)) {
    await upsert(db, "sales_orders", ["order_no"], [salesRow(db, o)]);
    await db`delete from sales_order_lines where order_no = ${o.orderNo}`;
    await upsert(
      db,
      "sales_order_lines",
      ["order_no", "line_no"],
      o.lines.map((l, i) => ({
        order_no: o.orderNo,
        line_no: i + 1,
        sku: l.sku,
        lot_batch: l.lotBatch,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        discount_percent: l.discountPercent,
        net_value: l.netValue,
        unit_cost: l.unitCost ?? null,
        returned_quantity: l.returnedQuantity ?? 0,
      })),
    );
  }
  await upsert(db, "stock_movements", ["id"], changed(before.stockMovements, after.stockMovements, (m) => m.id).map((m) => movementRow(db, m)));
  await upsert(db, "ar_documents", ["doc_no"], changed(before.arDocuments, after.arDocuments, (d) => d.docNo).map((d) => arRow(db, d)));
  // Payments reference invoices, so invoices go in first.
  const apChanged = changed(before.apDocuments, after.apDocuments, (d) => d.docNo);
  await upsert(db, "ap_documents", ["doc_no"], [...apChanged.filter((d) => d.type === "invoice"), ...apChanged.filter((d) => d.type === "payment")].map((d) => apRow(db, d)));
  const rateKey = (r: ExchangeRate) => `${r.currency}|${r.effectiveDate}`;
  await upsert(db, "exchange_rates", ["currency", "effective_date"], changed(before.exchangeRates, after.exchangeRates, rateKey).map((r) => ({ currency: r.currency, effective_date: r.effectiveDate, rate: r.rate })));
  await upsert(db, "expenses", ["doc_no"], changed(before.expenses, after.expenses, (x) => x.docNo).map((x) => expenseRow(db, x)));
  // A reversal references the entry it reverses, so originals go in first.
  const journalsChanged = changed(before.manualJournals, after.manualJournals, (j) => j.entryNo);
  await upsert(db, "manual_journals", ["entry_no"], [...journalsChanged.filter((j) => !j.reverses), ...journalsChanged.filter((j) => j.reverses)].map((j) => journalRow(db, j)));
  // Statement lines can be removed (imported by mistake); a match moving between lines is cleared first.
  const goneLines = removed(before.bankLines, after.bankLines, (l) => l.id);
  if (goneLines.length) await db`delete from bank_lines where id in ${db(goneLines)}`;
  const linesChanged = changed(before.bankLines, after.bankLines, (l) => l.id);
  if (linesChanged.length) await db`update bank_lines set matched_entry_id = null where id in ${db(linesChanged.map((l) => l.id))}`;
  await upsert(db, "bank_lines", ["id"], linesChanged.map(bankLineRow));
  await upsert(db, "quotations", ["quote_no"], changed(before.quotations, after.quotations, (q) => q.quoteNo).map((q) => quotationRow(db, q)));
  await upsert(
    db,
    "stock_counts",
    ["count_no"],
    changed(before.stockCounts, after.stockCounts, (c) => c.countNo).map((c) => ({
      count_no: c.countNo,
      warehouse: c.warehouse,
      date: c.date,
      status: c.status,
      lines: json(db, c.lines),
      note: c.note,
      created_by: json(db, c.createdBy),
      posted_by: json(db, c.postedBy),
      posted_on: c.postedOn ?? null,
    })),
  );
  await upsert(
    db,
    "ar_reminders",
    ["id"],
    changed(before.arReminders, after.arReminders, (r) => r.id).map((r) => ({
      id: r.id,
      customer_id: r.customerId,
      date: r.date,
      level: r.level,
      overdue_amount: r.overdueAmount,
      note: r.note,
      actor: json(db, r.actor),
    })),
  );
  await upsert(db, "purchase_requests", ["request_no"], changed(before.purchaseRequests, after.purchaseRequests, (r) => r.requestNo).map((r) => requestRow(db, r)));
  await upsert(db, "audit_log", ["id"], changed(before.auditLog, after.auditLog, (e) => e.id).map((e) => auditRow(db, e)));

  // Nothing in the domain deletes whole records today except duty-rate rows (handled with tax settings)
  // and documents (handled with their order). Guard against silent data loss if that ever changes.
  const lost = [
    ...removed(before.salesOrders, after.salesOrders, (o) => o.orderNo),
    ...removed(before.importOrders, after.importOrders, (o) => o.orderNo),
    ...removed(before.inventory, after.inventory, (i) => i.lotBatch),
    ...removed(before.auditLog, after.auditLog, (e) => e.id),
    ...removed(before.expenses, after.expenses, (x) => x.docNo),
    ...removed(before.manualJournals, after.manualJournals, (j) => j.entryNo),
    ...removed(before.quotations, after.quotations, (q) => q.quoteNo),
    ...removed(before.purchaseRequests, after.purchaseRequests, (r) => r.requestNo),
    ...removed(before.arReminders, after.arReminders, (r) => r.id),
    ...removed(before.stockCounts, after.stockCounts, (c) => c.countNo),
  ];
  if (lost.length) throw new Error(`Refusing to delete records not covered by a delete rule: ${lost.slice(0, 5).join(", ")}`);
}

async function saveTaxSettings(db: Db, t: TaxSettings) {
  await upsert(db, "tax_settings", ["id"], [
    { id: 1, vat_percent: t.vatPercent, excise_thb_per_abv_liter: t.exciseThbPerAbvLiter, default_duty_percent: t.defaultDutyPercent },
  ]);
  await db`delete from duty_rates`;
  await upsert(db, "duty_rates", ["hs_prefix"], t.dutyRates.map((r, i) => ({ hs_prefix: r.hsPrefix, label: r.label, duty_percent: r.dutyPercent, sort_order: i })));
}

/** Writes a whole Store into empty tables (first start / demo reset). */
export async function insertStore(db: Db, s: Store) {
  const empty: Store = {
    products: [],
    importOrders: [],
    licenses: [],
    customers: [],
    salesOrders: [],
    inventory: [],
    auditLog: [],
    suppliers: [],
    warehouses: [],
    priceLists: [],
    taxSettings: { vatPercent: NaN, exciseThbPerAbvLiter: NaN, defaultDutyPercent: NaN, dutyRates: [] },
    reorderPolicies: [],
    stockMovements: [],
    arDocuments: [],
    company: { name: { th: "", en: "" }, taxId: "", branch: "", address: { th: "", en: "" }, phone: "", email: "", openingDate: "", openingBank: NaN },
    exchangeRates: [],
    apDocuments: [],
    expenses: [],
    manualJournals: [],
    bankLines: [],
    quotations: [],
    purchaseRequests: [],
    arReminders: [],
    stockCounts: [],
  };
  await saveStore(db, empty, s);
}

export const ALL_TABLES = [
  "stock_counts",
  "ar_reminders",
  "purchase_requests",
  "quotations",
  "bank_lines",
  "manual_journals",
  "expenses",
  "ap_documents",
  "exchange_rates",
  "company",
  "audit_log",
  "ar_documents",
  "stock_movements",
  "sales_order_lines",
  "sales_orders",
  "inventory_lots",
  "import_order_documents",
  "import_order_lines",
  "import_orders",
  "reorder_policies",
  "duty_rates",
  "tax_settings",
  "price_list_overrides",
  "price_lists",
  "customers",
  "products",
  "licenses",
  "warehouses",
  "suppliers",
];
