import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Pencil, Plus, Lock, FileText, Table2, Columns3, CalendarDays } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { Toolbar } from "../components/Toolbar";
import { TableContainer, EmptyRow, EditedPill, th, td } from "../components/Table";
import { StatusBadge } from "../components/StatusBadge";
import { Masked } from "../components/Masked";
import { OrderLinesEditDrawer } from "../components/OrderLinesEditDrawer";
import { OrderItems } from "../components/OrderItems";
import { SalesOrderDocumentsModal } from "../components/SalesOrderDocumentsModal";
import { formatCurrency, formatDate, maskIfRestricted } from "../lib/format";
import { exportToExcel } from "../lib/export";
import { DeliveryStatusSelect } from "../components/DeliveryStatusSelect";
import { salesOrderDisplayStatus, canEditSalesOrder, DELIVERY_STATUS_OPTIONS, orderQuantity, isBookedSale, isReversedSale, salesStage } from "../lib/business";
import { salesFlow, stageReachedOn, BOARD_RECENT_DAYS, type PaymentInfo } from "../lib/flows";
import { useInvoiceStatus } from "../lib/useInvoiceStatus";
import { addDays, todayIso, daysOverdue } from "../lib/business";
import { MiniStepper } from "../components/Stepper";
import { ViewSwitcher, useViewMode } from "../components/ViewSwitcher";
import { KanbanBoard, BoardCard } from "../components/KanbanBoard";
import { CalendarView, CalendarLegend, type CalendarEvent, type EventTone } from "../components/CalendarView";
import type { SalesOrder } from "../data/types";
import { both } from "../i18n/translations";
import { RecordLink, paths } from "../components/RecordLink";

const STATUS_FILTER_OPTIONS = ["pendingApproval", "rejected", ...DELIVERY_STATUS_OPTIONS];
const VIEWS = ["table", "board", "calendar"] as const;
type View = (typeof VIEWS)[number];

/** Board columns, in the order an order moves through them. */
const BOARD: { key: string; stages: string[]; tone: EventTone }[] = [
  { key: "pendingApproval", stages: ["pendingApproval"], tone: "amber" },
  { key: "pendingShipment", stages: ["pendingShipment"], tone: "gray" },
  { key: "inDelivery", stages: ["inDelivery"], tone: "blue" },
  { key: "delivered", stages: ["delivered"], tone: "green" },
  { key: "exceptions", stages: ["returned", "damaged", "rejected"], tone: "red" },
];
/** Stages where the work is finished — their board columns show recent orders only. */
const FINISHED = ["delivered", "returned", "damaged", "rejected"];

export default function SalesOrders() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { canViewSensitive, can } = useRole();
  const { salesOrders: rows, products } = useData();
  const location = useLocation();
  const highlightOrderNo = (location.state as { highlightOrderNo?: string } | null)?.highlightOrderNo;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingNo, setEditingNo] = useState<string | null>(null);
  const [editedNos, setEditedNos] = useState<Set<string>>(new Set());
  const [docsOrderNo, setDocsOrderNo] = useState<string | null>(null);
  const [view, setView] = useViewMode<View>("sales-orders", VIEWS, "table");
  const [showDeliveries, setShowDeliveries] = useState(true);
  const [showDue, setShowDue] = useState(true);
  const invoiceStatus = useInvoiceStatus();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((o) => {
      const matchesSearch =
        !q ||
        o.orderNo.toLowerCase().includes(q) ||
        o.customerName.th.includes(search) ||
        o.customerName.en.toLowerCase().includes(q) ||
        o.lines.some(
          (l) =>
            l.sku.toLowerCase().includes(q) ||
            l.lotBatch.toLowerCase().includes(q) ||
            (products.find((p) => p.sku === l.sku)?.name.toLowerCase().includes(q) ?? false),
        );
      const matchesStatus = !statusFilter || salesOrderDisplayStatus(o) === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, products, search, statusFilter]);

  const editingRow = rows.find((o) => o.orderNo === editingNo) ?? null;
  const docsOrder = rows.find((o) => o.orderNo === docsOrderNo) ?? null;

  const markEdited = (orderNo: string) => setEditedNos((prev) => new Set(prev).add(orderNo));

  const handleExport = () => {
    exportToExcel(
      "sales-orders",
      [
        both("salesOrders.col.orderNo"),
        both("erp.orderDate"),
        both("salesOrders.col.customerName"),
        both("salesOrders.col.line"),
        both("salesOrders.col.sku"),
        both("products.col.name"),
        both("salesOrders.col.lotBatch"),
        both("salesOrders.col.quantity"),
        both("salesOrders.col.unitPrice"),
        both("salesOrders.col.discountPercent"),
        both("salesOrders.col.lineValue"),
        both("salesOrders.col.netValue"),
        both("ar.invoiceDate"),
        both("ar.dueDate"),
        both("salesOrders.col.deliveryStatus"),
        both("salesOrders.col.taxInvoiceNo"),
        both("salesOrders.col.deliveryNoteNo"),
        both("salesOrders.col.approver"),
      ],
      // One row per order line, so the sheet can be pivoted by product or lot.
      filtered.flatMap((o) =>
        o.lines.map((l, i) => [
          o.orderNo,
          o.orderDate,
          bi(o.customerName),
          i + 1,
          l.sku,
          products.find((p) => p.sku === l.sku)?.name ?? "",
          l.lotBatch,
          l.quantity,
          maskIfRestricted(l.unitPrice, canViewSensitive),
          maskIfRestricted(l.discountPercent, canViewSensitive),
          maskIfRestricted(l.netValue, canViewSensitive),
          maskIfRestricted(o.netValue, canViewSensitive),
          o.invoiceDate ?? "",
          o.dueDate ?? "",
          t(`status.${salesOrderDisplayStatus(o)}`),
          o.taxInvoiceNo,
          o.deliveryNoteNo,
          o.approver ? bi(o.approver) : "",
        ]),
      ),
    );
  };

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <PageHeader title={t("salesOrders.title")} subtitle={t("salesOrders.subtitle")} />
        {can("createSalesOrder") ? (
          <Link
            to="/sales-orders/new"
            data-shortcut="new"
            aria-keyshortcuts="n"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            <Plus size={15} />
            {t("salesOrders.newOrder")}
          </Link>
        ) : (
          <button
            disabled
            title={t("erp.noPermission")}
            className="flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-lg bg-gray-200 px-3.5 py-2 text-sm font-medium text-gray-400"
          >
            <Lock size={15} />
            {t("salesOrders.newOrder")}
          </button>
        )}
      </div>

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("salesOrders.searchPlaceholder")}
        statusValue={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={STATUS_FILTER_OPTIONS.map((s) => ({ value: s, label: t(`status.${s}`) }))}
        resultCount={filtered.length}
        totalCount={rows.length}
        onExport={handleExport}
        views={
          <ViewSwitcher
            value={view}
            onChange={setView}
            options={[
              { value: "table", label: t("views.table"), icon: Table2 },
              { value: "board", label: t("views.board"), icon: Columns3 },
              { value: "calendar", label: t("views.calendar"), icon: CalendarDays },
            ]}
          />
        }
      />

      {view === "board" && <SalesBoard orders={filtered} invoiceStatus={invoiceStatus} highlightOrderNo={highlightOrderNo} onChanged={markEdited} />}

      {view === "calendar" && (
        <CalendarView
          events={calendarEvents(filtered, { showDeliveries, showDue: showDue && invoiceStatus !== null }, invoiceStatus, t, bi)}
          legend={
            <CalendarLegend
              items={[
                { key: "deliveries", label: t("calendar.kind.delivery"), tone: "indigo", active: showDeliveries, onToggle: () => setShowDeliveries((v) => !v) },
                // Payment status needs price access; without it the kind isn't offered rather than shown wrong.
                ...(invoiceStatus
                  ? [{ key: "due", label: t("calendar.kind.paymentDue"), tone: "gold" as const, active: showDue, onToggle: () => setShowDue((v) => !v) }]
                  : []),
              ]}
            />
          }
        />
      )}

      {view === "table" && (
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("salesOrders.col.orderNo")}</th>
            <th className={th}>{t("erp.orderDate")}</th>
            <th className={th}>{t("salesOrders.col.customerName")}</th>
            <th className={th}>{t("salesOrders.col.items")}</th>
            <th className={`${th} text-right`}>{t("salesOrders.col.quantity")}</th>
            <th className={`${th} text-right`}>{t("salesOrders.col.netValue")}</th>
            <th className={th}>{t("ar.dueDate")}</th>
            <th className={th}>{t("salesOrders.col.deliveryStatus")}</th>
            <th className={th}>{t("salesOrders.col.taxInvoiceNo")}</th>
            <th className={th}>{t("salesOrders.col.deliveryNoteNo")}</th>
            <th className={th}>{t("salesOrders.col.approver")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.length === 0 && <EmptyRow colSpan={12} />}
          {filtered.map((o) => (
            <tr key={o.orderNo} className={`hover:bg-gray-50/60 ${o.orderNo === highlightOrderNo ? "bg-indigo-50/40" : ""}`}>
              <td className={`${td} whitespace-nowrap`}>
                <RecordLink to={paths.salesOrder(o.orderNo)} testid="order-link">
                  {o.orderNo}
                </RecordLink>
                {o.orderNo === highlightOrderNo && <EditedPill label={t("common.new")} />}
                {editedNos.has(o.orderNo) && <EditedPill />}
              </td>
              <td className={td}>{formatDate(o.orderDate, lang)}</td>
              <td className={td}>
                <RecordLink to={paths.customer(o.customerId)} className="font-normal">
                  {bi(o.customerName)}
                </RecordLink>
              </td>
              <td className={`${td} max-w-[16rem]`}>
                <OrderItems order={o} />
              </td>
              <td className={`${td} text-right tabular-nums`}>{orderQuantity(o)}</td>
              <td className={`${td} text-right font-medium tabular-nums text-gray-900`}>
                <Masked>฿{formatCurrency(o.netValue, lang)}</Masked>
              </td>
              <td className={td}>
              <td className={td}>
                <DueCell orderNo={o.orderNo} dueDate={o.dueDate} invoiceStatus={invoiceStatus} />
              </td>
              </td>
              <td className={td}>
                <div className="flex flex-col items-start gap-1.5">
                  <MiniStepper steps={salesFlow(o, invoiceStatus?.get(o.orderNo))} />
                  <DeliveryStatusSelect order={o} onChanged={markEdited} />
                </div>
              </td>
              <td className={td}>{o.taxInvoiceNo}</td>
              <td className={td}>{o.deliveryNoteNo}</td>
              <td className={td}>{o.approver ? bi(o.approver) : <span className="text-gray-400">{t("salesOrders.none")}</span>}</td>
              <td className={td}>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setDocsOrderNo(o.orderNo)}
                    disabled={Boolean(o.approvalStatus)}
                    title={o.approvalStatus ? t("salesOrderDocs.pendingApprovalNote") : undefined}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
                  >
                    <FileText size={13} />
                    {t("salesOrderDocs.action")}
                  </button>
                  <button
                    onClick={() => setEditingNo(o.orderNo)}
                    disabled={!can("editSalesOrder") || !canEditSalesOrder(o)}
                    title={!can("editSalesOrder") ? t("erp.noPermission") : !canEditSalesOrder(o) ? t("erp.editShippedNote") : undefined}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
                  >
                    {can("editSalesOrder") ? <Pencil size={13} /> : <Lock size={13} />}
                    {t("common.edit")}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </TableContainer>
      )}

      <OrderLinesEditDrawer order={editingRow} onClose={() => setEditingNo(null)} onSaved={markEdited} />

      <SalesOrderDocumentsModal order={docsOrder} onClose={() => setDocsOrderNo(null)} />
    </div>
  );
}

/**
 * What a sales calendar is for: deliveries on the date promised, and invoices on their due date while
 * money is still owed (paid ones are struck through, overdue ones outlined).
 */
function calendarEvents(
  orders: SalesOrder[],
  show: { showDeliveries: boolean; showDue: boolean },
  invoiceStatus: Map<string, PaymentInfo> | null,
  t: (k: string) => string,
  bi: (b: SalesOrder["customerName"]) => string,
): CalendarEvent[] {
  const today = todayIso();
  const events: CalendarEvent[] = [];
  for (const o of orders) {
    if (!isBookedSale(o) || isReversedSale(o)) continue;
    if (show.showDeliveries && o.plannedDeliveryDate) {
      const delivered = o.deliveryStatus === "delivered";
      events.push({
        id: `${o.orderNo}-dlv`,
        date: o.plannedDeliveryDate,
        title: `${o.orderNo} · ${bi(o.customerName)}`,
        subtitle: t(`status.${o.deliveryStatus}`),
        kind: t("calendar.kind.delivery"),
        tone: "indigo",
        href: `/sales-orders/${o.orderNo}`,
        done: delivered,
        late: !delivered && o.plannedDeliveryDate < today,
      });
    }
    const pay = invoiceStatus?.get(o.orderNo);
    if (show.showDue && pay) {
      const paid = pay.open <= 0.005;
      events.push({
        id: `${o.orderNo}-due`,
        date: pay.dueDate,
        title: `${o.taxInvoiceNo} · ${bi(o.customerName)}`,
        subtitle: paid ? t("flow.sales.paid") : o.orderNo,
        kind: t("calendar.kind.paymentDue"),
        tone: "gold",
        href: `/sales-orders/${o.orderNo}`,
        done: paid,
        late: !paid && pay.dueDate < today,
      });
    }
  }
  return events;
}

/** Due date plus where the money stands: Paid, Overdue (n days), or nothing extra while it isn't due yet. */
function DueCell({ orderNo, dueDate, invoiceStatus }: { orderNo: string; dueDate?: string; invoiceStatus: Map<string, PaymentInfo> | null }) {
  const { t, lang } = useLanguage();
  if (!dueDate) return <span className="text-gray-400">—</span>;
  const pay = invoiceStatus?.get(orderNo);
  const late = pay && pay.open > 0.005 ? daysOverdue(pay.dueDate, todayIso()) : 0;
  return (
    <span className="flex flex-col whitespace-nowrap">
      <span>{formatDate(dueDate, lang)}</span>
      {pay && pay.open <= 0.005 && <span className="text-xs font-medium text-emerald-700">{t("flow.sales.paid")}</span>}
      {late > 0 && <span className="text-xs font-medium text-rose-700">{t("flow.overdueBy").replace("{n}", String(late))}</span>}
    </span>
  );
}

function SalesBoard({
  orders,
  invoiceStatus,
  highlightOrderNo,
  onChanged,
}: {
  orders: SalesOrder[];
  invoiceStatus: Map<string, PaymentInfo> | null;
  highlightOrderNo?: string;
  onChanged: (orderNo: string) => void;
}) {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const since = addDays(todayIso(), -BOARD_RECENT_DAYS);
  return (
    <KanbanBoard
      columns={BOARD.map((c) => {
        const inStage = orders.filter((o) => c.stages.includes(salesStage(o)));
        // Finished orders pile up forever — the board shows the last 30 days; the table has the rest.
        const finished = c.stages.every((st) => FINISHED.includes(st));
        const items = finished ? inStage.filter((o) => stageReachedOn(o, o.orderDate) >= since) : inStage;
        return {
          key: c.key,
          label: t(c.key === "exceptions" ? "views.exceptions" : `status.${c.key}`),
          tone: c.tone,
          items,
          olderHidden: finished ? inStage.length - items.length : undefined,
          footer: (
            <Masked>
              ฿{formatCurrency(items.reduce((sum, o) => sum + o.netValue, 0), lang)}
            </Masked>
          ),
        };
      })}
      itemKey={(o) => o.orderNo}
      renderCard={(o) => (
        <BoardCard highlight={o.orderNo === highlightOrderNo}>
          <div className="flex items-start justify-between gap-2">
            <Link to={`/sales-orders/${o.orderNo}`} className="text-sm font-semibold text-gray-900 hover:text-indigo-600">
              {o.orderNo}
            </Link>
            <span className="text-xs text-gray-500">{formatDate(o.orderDate, lang)}</span>
          </div>
          <p className="mt-0.5 truncate text-sm text-gray-700">{bi(o.customerName)}</p>
          <p className="mt-1 text-xs text-gray-500">
            <OrderItems order={o} />
          </p>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <MiniStepper steps={salesFlow(o, invoiceStatus?.get(o.orderNo))} showLabel={false} />
            <span className="text-sm font-semibold tabular-nums text-gray-900">
              <Masked>฿{formatCurrency(o.netValue, lang)}</Masked>
            </span>
          </div>
          {["returned", "damaged", "rejected"].includes(salesStage(o)) && (
            <div className="mt-2">
              <StatusBadge status={salesStage(o)} />
            </div>
          )}
          <div className="mt-2 empty:hidden">
            <DeliveryStatusSelect order={o} onChanged={onChanged} />
          </div>
        </BoardCard>
      )}
    />
  );
}
