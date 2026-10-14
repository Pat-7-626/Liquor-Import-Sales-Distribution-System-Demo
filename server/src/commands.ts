import { z } from "zod";
import * as A from "../../src/domain/actions.ts";
import type { Ctx } from "../../src/domain/actions.ts";
import type { Store } from "../../src/domain/store.ts";
import { todayIso } from "../../src/lib/business.ts";
import { sql, type Tx } from "./db.ts";
import { loadStore, saveStore } from "./repo.ts";

// ───────────────────────────── input schemas ─────────────────────────────

const str = z.string().trim().max(500);
const id = z.string().trim().min(1).max(64);
const num = z.number().finite();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bi = z.object({ th: str, en: str });
const channel = z.enum(["distributor", "retailWholesale", "restaurantBar", "online"]);
const country = z.enum(["scotland", "mexico", "france", "sweden", "uk", "jamaica", "japan"]);
const line = z.object({ sku: z.string().max(64), abv: num, qty: num, unitPrice: num });

/** Each command: a tuple schema for its arguments and the domain action it runs. */
const COMMANDS = {
  updateProduct: { args: z.tuple([id, z.object({ costPrice: num, suggestedPrice: num })]), run: A.updateProduct },
  updateImportOrder: { args: z.tuple([id, z.object({ etaDate: date })]), run: A.updateImportOrder },
  recordCustomsClearance: { args: z.tuple([id, str]), run: A.recordCustomsClearance },
  updateLicense: { args: z.tuple([id, z.object({ expiryDate: date })]), run: A.updateLicense },
  updateCustomerTerms: {
    args: z.tuple([id, z.object({ creditLimit: num, standardDiscount: num, channelType: channel, creditTermDays: num })]),
    run: A.updateCustomerTerms,
  },
  updateCustomerProfile: {
    args: z.tuple([id, z.object({ name: bi, taxId: z.string().max(20), branch: z.string().max(10), address: bi, email: z.string().max(200).optional() })]),
    run: A.updateCustomerProfile,
  },
  updateCompanyProfile: {
    args: z.tuple([
      z.object({ name: bi, taxId: z.string().max(20), branch: z.string().max(10), address: bi, phone: str, email: str }),
    ]),
    run: A.updateCompanyProfile,
  },
  recordPayment: { args: z.union([z.tuple([id, num, z.enum(["transfer", "cheque", "cash"]), str]), z.tuple([id, num, z.enum(["transfer", "cheque", "cash"]), str, id.nullable()])]), run: A.recordPayment },
  saveExchangeRate: { args: z.tuple([z.object({ currency: z.string().max(3), effectiveDate: date, rate: num })]), run: A.saveExchangeRate },
  recordSupplierInvoice: {
    args: z.tuple([id, z.string().trim().min(1).max(64), date]),
    run: A.recordSupplierInvoice,
  },
  recordSupplierPayment: {
    args: z.tuple([id, num, num, z.enum(["transfer", "cheque", "cash"]), str]),
    run: A.recordSupplierPayment,
  },
  scheduleDelivery: { args: z.tuple([id, date]), run: A.scheduleDelivery },
  setOpeningBalances: { args: z.tuple([date, num]), run: A.setOpeningBalances },
  closePeriod: { args: z.tuple([date]), run: A.closePeriod },
  reopenPeriod: { args: z.tuple([z.string().trim().max(200)]), run: A.reopenPeriod },
  recordExpense: {
    args: z.tuple([
      z.object({
        date,
        payee: str,
        payeeTaxId: z.string().trim().max(20),
        payeeType: z.enum(["company", "individual"]),
        account: z.string().max(10),
        description: str,
        amount: num,
        vat: num,
        whtRate: num,
        method: z.enum(["transfer", "cheque", "cash"]),
        reference: str,
      }),
    ]),
    run: A.recordExpense,
  },
  remitWithholding: { args: z.tuple([z.string().regex(/^\d{4}-\d{2}$/), str]), run: A.remitWithholding },
  postJournal: {
    args: z.tuple([
      z.object({
        date,
        memo: str,
        lines: z.array(z.object({ account: z.string().max(10), debit: num, credit: num })).min(2).max(20),
        bankLineId: id.nullable().optional(),
      }),
    ]),
    run: A.postJournal,
  },
  reverseJournal: { args: z.tuple([id, z.string().trim().max(200)]), run: A.reverseJournal },
  importBankLines: {
    args: z.tuple([z.array(z.object({ date, description: z.string().trim().max(200), amount: num, reference: z.string().trim().max(100) })).min(1).max(2000)]),
    run: A.importBankLines,
  },
  autoMatchBank: { args: z.tuple([]), run: A.autoMatchBank },
  matchBankLine: { args: z.tuple([id, z.string().trim().min(1).max(200)]), run: A.matchBankLine },
  unmatchBankLine: { args: z.tuple([id]), run: A.unmatchBankLine },
  deleteBankLine: { args: z.tuple([id]), run: A.deleteBankLine },
  createQuotation: {
    args: z.tuple([
      z.object({
        customerId: id,
        validUntil: date,
        lines: z.array(z.object({ sku: id, quantity: num, unitPrice: num, discountPercent: num })).min(1).max(50),
        notes: str,
      }),
    ]),
    run: A.createQuotation,
  },
  declineQuotation: { args: z.tuple([id, str]), run: A.declineQuotation },
  convertQuotation: { args: z.union([z.tuple([id]), z.tuple([id, date])]), run: A.convertQuotation },
  createPurchaseRequest: {
    args: z.tuple([z.object({ sku: id, quantity: num, reason: str, preferredSupplierId: id.nullable() })]),
    run: A.createPurchaseRequest,
  },
  decidePurchaseRequest: { args: z.tuple([id, z.boolean(), str]), run: A.decidePurchaseRequest },
  startStockCount: { args: z.tuple([id, z.string().trim().max(200)]), run: A.startStockCount },
  enterStockCount: { args: z.tuple([id, z.array(z.object({ lotBatch: id, counted: num.nullable() })).min(1).max(2000)]), run: A.enterStockCount },
  postStockCount: { args: z.tuple([id]), run: A.postStockCount },
  cancelStockCount: { args: z.tuple([id]), run: A.cancelStockCount },
  recordReminder: { args: z.tuple([id, z.number().int(), z.string().trim().max(300)]), run: A.recordReminder },
  returnSalesLines: {
    args: z.tuple([id, z.array(z.object({ line: z.number().int().min(0).max(49), quantity: num })).min(1).max(50), z.string().trim().max(200)]),
    run: A.returnSalesLines,
  },
  updateDeliveryStatus: { args: z.tuple([id, z.enum(["delivered", "inDelivery", "pendingShipment", "returned", "damaged"])]), run: A.updateDeliveryStatus },
  editSalesOrder: { args: z.tuple([id, z.array(z.object({ quantity: num, unitPrice: num, discountPercent: num })).min(1).max(50)]), run: A.editSalesOrder },
  adjustInventory: {
    args: z.tuple([id, z.object({ quantityRemaining: num, receivedDate: date, warehouse: id }), str]),
    run: A.adjustInventory,
  },
  createSalesOrder: {
    args: z.tuple([
      z.object({
        customerId: id,
        lines: z.array(z.object({ sku: id, lotBatch: id, quantity: num, unitPrice: num, discountPercent: num })).min(1).max(50),
        plannedDeliveryDate: date.optional(),
      }),
    ]),
    run: A.createSalesOrder,
  },
  approveSalesOrder: { args: z.tuple([id]), run: A.approveSalesOrder },
  rejectSalesOrderApproval: { args: z.tuple([id, str]), run: A.rejectSalesOrderApproval },
  createImportOrder: {
    args: z.tuple([
      z.object({
        supplierId: id,
        country,
        incoterms: str,
        orderDate: date,
        etaDate: date,
        intakeMethod: bi,
        lineItems: z.array(line).min(1).max(200),
        logistics: z.object({ manufacturerRegNo: str, blAwbNumber: str, origin: str, destination: str, currency: str, paymentTerms: str }),
        importLicenseNo: id.nullable(),
        purchaseRequestNo: id.nullable().optional(),
      }),
    ]),
    run: A.createImportOrder,
    // The order date is the server's today — a client can't backdate an order.
    prepare: (args: unknown[]) => [{ ...(args[0] as object), orderDate: todayIso() }],
  },
  correctImportOrderLines: { args: z.tuple([id, z.array(line).min(1).max(200)]), run: A.correctImportOrderLines },
  approveImportOrder: { args: z.tuple([id]), run: A.approveImportOrder },
  rejectImportOrder: { args: z.tuple([id, str]), run: A.rejectImportOrder },
  receiveGoods: {
    args: z.tuple([
      z.object({
        orderNo: id,
        receivedDate: date,
        warehouse: id,
        lines: z.array(z.object({ sku: z.string().max(64), orderedQty: num, receivedQty: num, lotBatch: z.string().max(64), exciseStampDate: z.string().max(10) })).min(1),
        additionalCostThb: num.optional(),
      }),
    ]),
    run: A.receiveGoods,
    // Goods are received today, as far as the record is concerned.
    prepare: (args: unknown[]) => [{ ...(args[0] as object), receivedDate: todayIso() }],
  },
  removeDocument: { args: z.tuple([id, id]), run: A.removeDocument },
  createProduct: {
    args: z.tuple([
      z.object({
        sku: id,
        name: str,
        category: z.enum(["whisky", "tequila", "redWine", "whiteWine", "vodka", "gin", "liqueur", "rum", "beer"]),
        abv: num,
        packageSize: num,
        unit: z.enum(["bottle", "pack"]),
        costPrice: num,
        suggestedPrice: num,
        hsCode: str,
      }),
    ]),
    run: A.createProduct,
  },
  createCustomer: {
    args: z.tuple([
      z.object({
        customerId: id,
        name: bi,
        taxId: z.string().max(20),
        branch: z.string().max(10),
        address: bi,
        creditTermDays: num,
        channelType: channel,
        licenseNo: id.nullable(),
        creditLimit: num,
        standardDiscount: num,
      }),
    ]),
    run: A.createCustomer,
  },
  createLicense: {
    args: z.tuple([z.object({ licenseNo: id, type: bi, holder: bi, category: z.enum(["import", "sales"]), issueDate: date, expiryDate: date })]),
    run: A.createLicense,
  },
  saveSupplier: {
    args: z.tuple([
      z.object({
        supplierId: id,
        name: str,
        country,
        manufacturerRegNo: str,
        origin: str,
        defaultIncoterms: str,
        currency: str,
        paymentTerms: str,
        paymentTermDays: num,
        contactEmail: str,
        active: z.boolean(),
      }),
      z.enum(["create", "update"]),
    ]),
    run: A.saveSupplier,
  },
  saveWarehouse: {
    args: z.tuple([
      z.object({ code: id, name: bi, address: str, capacity: num, bonded: z.boolean(), active: z.boolean() }),
      z.enum(["create", "update"]),
    ]),
    run: A.saveWarehouse,
  },
  updatePriceList: { args: z.tuple([channel, num]), run: A.updatePriceList },
  setPriceOverride: { args: z.tuple([channel, id, num.nullable()]), run: A.setPriceOverride },
  updateTaxSettings: {
    args: z.tuple([
      z.object({
        vatPercent: num,
        exciseThbPerAbvLiter: num,
        defaultDutyPercent: num,
        dutyRates: z.array(z.object({ hsPrefix: z.string().max(10), label: str, dutyPercent: num })).max(100),
      }),
    ]),
    run: A.updateTaxSettings,
  },
  saveReorderPolicy: {
    args: z.tuple([z.object({ sku: id, reorderPoint: num, reorderQty: num, preferredSupplierId: id.nullable() })]),
    run: A.saveReorderPolicy,
  },
} as const;

export type CommandName = keyof typeof COMMANDS;
export const isCommand = (name: string): name is CommandName => Object.hasOwn(COMMANDS, name);

export type CommandResult = A.ActionResult & Record<string, unknown>;

/**
 * Validates arguments, then runs one domain action inside a transaction holding a global advisory lock:
 * load store → act → write the difference. Writes are serialised (simple and correct at this scale —
 * no lost updates on stock or balances); reads never take the lock.
 */
export async function runCommand(name: CommandName, rawArgs: unknown, ctx: Ctx, extra?: (tx: Tx, store: Store) => Promise<void>): Promise<CommandResult> {
  const cmd = COMMANDS[name] as { args: z.ZodType; run: (s: Store, c: Ctx, ...a: unknown[]) => CommandResult; prepare?: (a: unknown[]) => unknown[] };
  const parsed = cmd.args.safeParse(rawArgs);
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join(".") ?? "";
    return { ok: false, error: { th: `ข้อมูลไม่ถูกต้อง (${where})`, en: `Invalid input (${where})` } };
  }
  const args = cmd.prepare ? cmd.prepare(parsed.data as unknown[]) : (parsed.data as unknown[]);
  return withLockedStore(async (tx, store) => {
    const result = cmd.run(store, ctx, ...args);
    if (result.ok && extra) await extra(tx, store);
    return result;
  });
}

/** Runs `fn` against a freshly loaded store under the write lock; persists changes only if it succeeds. */
export async function withLockedStore<R extends { ok: boolean }>(fn: (tx: Tx, store: Store) => Promise<R> | R): Promise<R> {
  return (await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(4242)`;
    const store = await loadStore(tx);
    const before = structuredClone(store);
    const result = await fn(tx, store);
    if (result.ok) await saveStore(tx, before, store);
    return result;
  })) as R;
}
