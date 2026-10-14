import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import type { StockMovementType } from "../data/types";

const MOVEMENT_TONE: Record<StockMovementType, string> = {
  receipt: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  sale: "bg-blue-50 text-blue-700 ring-blue-600/20",
  return: "bg-amber-50 text-amber-700 ring-amber-600/20",
  adjustment: "bg-gray-100 text-gray-600 ring-gray-500/20",
};

export function MovementTypeBadge({ type }: { type: StockMovementType }) {
  const { t } = useLanguage();
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${MOVEMENT_TONE[type]}`}>
      {t(`erp.movement.${type}`)}
    </span>
  );
}

/** Links a movement's reference to its source document when it is one (sales or import order). */
export function MovementReference({ reference }: { reference: string }) {
  const orderNo = reference.split(" ")[0];
  if (orderNo.startsWith("SO-"))
    return (
      <Link to={`/sales-orders/${orderNo}`} className="text-indigo-600 hover:underline">
        {reference}
      </Link>
    );
  if (orderNo.startsWith("IMP-"))
    return (
      <Link to={`/import-orders/${orderNo}`} className="text-indigo-600 hover:underline">
        {reference}
      </Link>
    );
  return <span className="text-gray-500">{reference}</span>;
}
