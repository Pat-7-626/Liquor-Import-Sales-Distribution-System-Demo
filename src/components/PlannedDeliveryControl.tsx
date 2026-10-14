import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { useRunAction } from "../lib/useRunAction";
import { addDays, isBookedSale, todayIso } from "../lib/business";
import { inputClass } from "./FormKit";
import type { SalesOrder } from "../data/types";

/** Reschedule an order's planned delivery — dispatch's job, and only while the goods are still on their way. */
export function PlannedDeliveryControl({ order }: { order: SalesOrder }) {
  const { t } = useLanguage();
  const { can } = useRole();
  const { scheduleDelivery } = useData();
  const runAction = useRunAction();
  const [date, setDate] = useState(order.plannedDeliveryDate ?? "");
  const [base, setBase] = useState(order.plannedDeliveryDate);
  if (base !== order.plannedDeliveryDate) {
    setBase(order.plannedDeliveryDate);
    setDate(order.plannedDeliveryDate ?? "");
  }

  const open = order.approvalStatus !== "rejected" && ["pendingShipment", "inDelivery"].includes(order.deliveryStatus);
  if (!open || !isBookedSale(order)) return null;
  const allowed = can("updateDelivery");
  const changed = date !== (order.plannedDeliveryDate ?? "");

  return (
    <div className="flex items-center gap-1.5">
      <CalendarClock size={15} className="text-gray-400" aria-hidden="true" />
      <label className="sr-only" htmlFor={`plan-${order.orderNo}`}>
        {t("flow.plannedDelivery")}
      </label>
      <input
        id={`plan-${order.orderNo}`}
        type="date"
        value={date}
        min={order.orderDate}
        max={addDays(todayIso(), 90)}
        disabled={!allowed}
        title={allowed ? t("flow.plannedDelivery") : t("erp.noPermission")}
        onChange={(e) => setDate(e.target.value)}
        data-testid="planned-delivery"
        className={`${inputClass} w-auto! py-1 text-xs disabled:bg-gray-50 disabled:text-gray-400`}
      />
      {changed && (
        <button
          onClick={() => runAction(scheduleDelivery(order.orderNo, date), `${t("flow.rescheduled")}: ${order.orderNo}`)}
          disabled={!date}
          className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:bg-gray-200 disabled:text-gray-400"
        >
          {t("common.save")}
        </button>
      )}
    </div>
  );
}
