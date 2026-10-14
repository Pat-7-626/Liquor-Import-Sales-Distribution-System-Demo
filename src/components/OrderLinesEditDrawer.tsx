import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRunAction } from "../lib/useRunAction";
import { EditDrawer, type FieldConfig, type FieldValue } from "./EditDrawer";
import type { SalesOrder } from "../data/types";

/**
 * Edits quantity, price and discount on every line of a sales order. The server re-checks stock, credit and
 * approval rules, and issues a credit/debit note when an invoiced order's value changes.
 */
export function OrderLinesEditDrawer({ order, onClose, onSaved }: { order: SalesOrder | null; onClose: () => void; onSaved?: (orderNo: string) => void }) {
  const { t } = useLanguage();
  const bi = useBi();
  const runAction = useRunAction();
  const { products, editSalesOrder } = useData();

  const fields: FieldConfig[] = (order?.lines ?? []).flatMap((l, i) => {
    const name = products.find((p) => p.sku === l.sku)?.name ?? l.sku;
    return [
      { key: `quantity_${i}`, label: t("salesOrders.col.quantity"), type: "number", min: 1, step: 1, section: `${i + 1}. ${name} · ${l.lotBatch}` },
      { key: `unitPrice_${i}`, label: t("salesOrders.col.unitPrice"), type: "number", suffix: "THB", min: 0 },
      { key: `discountPercent_${i}`, label: t("salesOrders.col.discountPercent"), type: "number", suffix: "%", min: 0, max: 99 },
    ] satisfies FieldConfig[];
  });

  const values: Record<string, FieldValue> = Object.fromEntries(
    (order?.lines ?? []).flatMap((l, i) => [
      [`quantity_${i}`, l.quantity],
      [`unitPrice_${i}`, l.unitPrice],
      [`discountPercent_${i}`, l.discountPercent],
    ]),
  );

  const handleSave = async (v: Record<string, FieldValue>) => {
    if (!order) return;
    const terms = order.lines.map((_, i) => ({
      quantity: Number(v[`quantity_${i}`]),
      unitPrice: Number(v[`unitPrice_${i}`]),
      discountPercent: Number(v[`discountPercent_${i}`]),
    }));
    const result = await editSalesOrder(order.orderNo, terms);
    if (!(await runAction(result, `${t("common.save")}: ${order.orderNo}`))) return;
    onSaved?.(order.orderNo);
    onClose();
  };

  return (
    <EditDrawer
      open={order !== null}
      title={t("salesOrders.editTitle")}
      subtitle={order ? `${order.orderNo} · ${bi(order.customerName)}` : ""}
      note={t("erp.editSalesNote")}
      fields={fields}
      values={values}
      onClose={onClose}
      onSave={handleSave}
    />
  );
}
