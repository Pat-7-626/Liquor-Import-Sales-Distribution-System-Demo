import { useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { CalendarView, CalendarLegend, TONE_DOT, type CalendarEvent, type EventTone } from "../components/CalendarView";
import { addDays, computeArOpenItems, importStage, isBookedSale, todayIso } from "../lib/business";
import { formatCurrency } from "../lib/format";

type Kind = "eta" | "delivery" | "payment" | "license";
/** One colour per kind of event. Late and done are shown by outline and strike-through, not colour. */
const KIND_TONE: Record<Kind, EventTone> = { eta: "blue", delivery: "indigo", payment: "gold", license: "gray" };
/** How far ahead "coming up" looks for each kind — licenses are renewed weeks ahead, the rest day to day. */
const HORIZON: Record<Kind, number> = { eta: 7, delivery: 7, payment: 7, license: 30 };

type Ev = CalendarEvent & { k: Kind; amount?: number };

/** Dated commitments across modules: goods arriving, deliveries promised, money due, licenses expiring. */
export default function Calendar() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { canViewSensitive } = useRole();
  const { importOrders, salesOrders, customers, arDocuments, licenses } = useData();
  const [shown, setShown] = useState<Record<Kind, boolean>>({ eta: true, delivery: true, payment: true, license: true });
  const today = todayIso();

  const all = useMemo(() => {
    const out: Ev[] = [];

    for (const o of importOrders) {
      const stage = importStage(o);
      if (stage === "rejected") continue;
      const arrived = stage === "receivedWarehouse";
      out.push({
        k: "eta",
        id: `eta-${o.orderNo}`,
        date: o.etaDate,
        title: `${o.orderNo} · ${o.supplier}`,
        subtitle: t(`status.${stage}`),
        kind: t("calendar.kind.eta"),
        tone: KIND_TONE.eta,
        href: `/import-orders/${o.orderNo}`,
        done: arrived,
        late: !arrived && o.etaDate < today,
      });
    }

    // Deliveries on the date promised to the customer.
    for (const o of salesOrders) {
      if (!isBookedSale(o) || !o.plannedDeliveryDate || o.deliveryStatus === "returned" || o.deliveryStatus === "damaged") continue;
      const delivered = o.deliveryStatus === "delivered";
      out.push({
        k: "delivery",
        id: `del-${o.orderNo}`,
        date: o.plannedDeliveryDate,
        title: `${o.orderNo} · ${bi(o.customerName)}`,
        subtitle: t(`status.${o.deliveryStatus}`),
        kind: t("calendar.kind.delivery"),
        tone: KIND_TONE.delivery,
        href: `/sales-orders/${o.orderNo}`,
        done: delivered,
        late: !delivered && o.plannedDeliveryDate < today,
      });
    }

    // Money still owed, on its due date — only what receivables says is open after payments.
    if (canViewSensitive) {
      for (const c of customers)
        for (const i of computeArOpenItems(c, salesOrders, arDocuments))
          out.push({
            k: "payment",
            id: `pay-${c.customerId}-${i.ref}`,
            date: i.dueDate,
            title: `${bi(c.name)} · ฿${formatCurrency(i.open, lang)}`,
            subtitle: i.ref,
            kind: t("calendar.kind.paymentDue"),
            tone: KIND_TONE.payment,
            href: i.orderNo ? `/sales-orders/${i.orderNo}` : `/customers/${c.customerId}`,
            late: i.dueDate < today,
            amount: i.open,
          });
    }

    for (const l of licenses)
      out.push({
        k: "license",
        id: `lic-${l.licenseNo}`,
        date: l.expiryDate,
        title: `${l.licenseNo} · ${bi(l.holder)}`,
        kind: t("calendar.kind.licenseExpiry"),
        tone: KIND_TONE.license,
        href: "/licenses",
        late: l.expiryDate < today,
      });
    return out;
  }, [importOrders, salesOrders, customers, arDocuments, licenses, canViewSensitive, t, bi, lang, today]);

  const kinds: Kind[] = canViewSensitive ? ["eta", "delivery", "payment", "license"] : ["eta", "delivery", "license"];
  const label: Record<Kind, string> = {
    eta: t("calendar.kind.eta"),
    delivery: t("calendar.kind.delivery"),
    payment: t("calendar.kind.paymentDue"),
    license: t("calendar.kind.licenseExpiry"),
  };
  const late = (k: Kind) => all.filter((e) => e.k === k && e.late);
  const upcoming = (k: Kind) => all.filter((e) => e.k === k && !e.done && !e.late && e.date >= today && e.date <= addDays(today, HORIZON[k]));
  const sum = (list: Ev[]) => list.reduce((s, e) => s + (e.amount ?? 0), 0);

  return (
    <div>
      <PageHeader title={t("calendar.title")} subtitle={t("calendar.subtitle")} />

      {/* Each kind keeps its own counts — late arrivals, late deliveries, overdue money and expired licenses are different jobs. */}
      <div className={`mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 ${canViewSensitive ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        {kinds.map((k) => {
          const l = late(k);
          const u = upcoming(k);
          return (
            <div key={k} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <p className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                <span className={`h-2 w-2 rounded-full ${TONE_DOT[KIND_TONE[k]]}`} />
                {label[k]}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <p className={`text-2xl font-semibold tabular-nums ${l.length ? "text-rose-700" : "text-gray-900"}`}>{l.length}</p>
                  <p className="text-xs text-gray-500">
                    {t(`calendar.lateLabel.${k}`)}
                    {k === "payment" && l.length > 0 && <span className="block font-medium text-rose-700">฿{formatCurrency(sum(l), lang)}</span>}
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-gray-900">{u.length}</p>
                  <p className="text-xs text-gray-500">
                    {t("calendar.nextDays").replace("{n}", String(HORIZON[k]))}
                    {k === "payment" && u.length > 0 && <span className="block font-medium text-gray-700">฿{formatCurrency(sum(u), lang)}</span>}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!canViewSensitive && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-gray-500">
          <Lock size={12} />
          {t("calendar.paymentsRestricted")}
        </p>
      )}

      <CalendarView
        events={all.filter((e) => shown[e.k] && kinds.includes(e.k))}
        legend={
          <CalendarLegend
            items={kinds.map((k) => ({
              key: k,
              label: label[k],
              tone: KIND_TONE[k],
              count: all.filter((e) => e.k === k).length,
              active: shown[k],
              onToggle: () => setShown((s) => ({ ...s, [k]: !s[k] })),
            }))}
          />
        }
      />
    </div>
  );
}
