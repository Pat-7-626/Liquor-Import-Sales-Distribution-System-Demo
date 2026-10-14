import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import type { SalesOrder } from "../data/types";

/** "Golden Barrel 12Y × 60" for one line, "+2 more" when the order has several. */
export function OrderItems({ order, withQty = true }: { order: Pick<SalesOrder, "lines">; withQty?: boolean }) {
  const { t } = useLanguage();
  const { products } = useData();
  const [first, ...rest] = order.lines;
  if (!first) return <span className="text-gray-400">—</span>;
  const name = products.find((p) => p.sku === first.sku)?.name ?? first.sku;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <span className="truncate">
        {name}
        {withQty && <span className="text-gray-500"> × {first.quantity}</span>}
      </span>
      {rest.length > 0 && (
        <span
          title={rest.map((l) => `${products.find((p) => p.sku === l.sku)?.name ?? l.sku} × ${l.quantity}`).join("\n")}
          className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
        >
          +{rest.length} {t("erp.moreItems")}
        </span>
      )}
    </span>
  );
}
