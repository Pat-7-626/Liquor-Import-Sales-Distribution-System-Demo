import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { useRunAction } from "../lib/useRunAction";
import { deliveryStatusChoices, isBookedSale } from "../lib/business";
import type { DeliveryStatus, SalesOrder } from "../data/types";
import { selectClass } from "./FormKit";

/**
 * FR-24: delivery status picker shared by the list and detail pages. Offers only the statuses the
 * order may legally move to next, and confirms the irreversible ones (Returned / Damaged reverse stock
 * and the customer's balance).
 */
export function DeliveryStatusSelect({ order, onChanged }: { order: SalesOrder; onChanged?: (orderNo: string) => void }) {
  const { t } = useLanguage();
  const { can } = useRole();
  const { updateDeliveryStatus } = useData();
  const runAction = useRunAction();

  if (!isBookedSale(order)) return null;
  const choices = deliveryStatusChoices(order.deliveryStatus);
  if (choices.length === 1) return null;

  const handleChange = async (next: DeliveryStatus) => {
    if ((next === "returned" || next === "damaged") && !window.confirm(t(`erp.confirm.${next}`))) return;
    if (await runAction(updateDeliveryStatus(order.orderNo, next), `${t("common.save")}: ${order.orderNo}`)) onChanged?.(order.orderNo);
  };

  return (
    <select
      value={order.deliveryStatus}
      onChange={(e) => handleChange(e.target.value as DeliveryStatus)}
      disabled={!can("updateDelivery")}
      title={can("updateDelivery") ? t("salesOrderDetail.updateDeliveryStatus") : t("erp.noPermission")}
      aria-label={t("salesOrderDetail.updateDeliveryStatus")}
      className={`${selectClass} w-auto! py-1 text-xs disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400`}
    >
      {choices.map((s) => (
        <option key={s} value={s}>
          {s === order.deliveryStatus ? t(`status.${s}`) : `→ ${t(`status.${s}`)}`}
        </option>
      ))}
    </select>
  );
}
