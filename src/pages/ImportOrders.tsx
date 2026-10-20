import { useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Pencil, Plus, Lock, Table2, Columns3, CalendarDays, Ship } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import { PageHeader } from "../components/PageHeader";
import { Toolbar } from "../components/Toolbar";
import { TableContainer, EmptyRow, EditedPill, th, td } from "../components/Table";
import { Masked } from "../components/Masked";
import { EditDrawer, type FieldConfig, type FieldValue } from "../components/EditDrawer";
import { formatCurrency, formatDate, maskIfRestricted } from "../lib/format";
import { exportToExcel } from "../lib/export";
import { isImportOverdue, importStage, todayIso, addDays } from "../lib/business";
import { importFlow, stageReachedOn, BOARD_RECENT_DAYS } from "../lib/flows";
import { MiniStepper } from "../components/Stepper";
import { ViewSwitcher, useViewMode } from "../components/ViewSwitcher";
import { KanbanBoard, BoardCard } from "../components/KanbanBoard";
import { CalendarView, CalendarLegend, type CalendarEvent, type EventTone } from "../components/CalendarView";
import type { ImportOrder } from "../data/types";
import { useRunAction } from "../lib/useRunAction";
import { both } from "../i18n/translations";
import { RecordLink, paths } from "../components/RecordLink";

const STATUS_OPTIONS = [
  "staging",
  "pendingApproval",
  "approved",
  "customsCleared",
  "receivedWarehouse",
  "issueDetected",
  "rejected",
];

const VIEWS = ["table", "board", "calendar"] as const;
type View = (typeof VIEWS)[number];

const BOARD: { key: string; stages: string[]; tone: EventTone }[] = [
  { key: "staging", stages: ["staging"], tone: "gray" },
  { key: "pendingApproval", stages: ["pendingApproval", "firstApproved"], tone: "amber" },
  { key: "approved", stages: ["approved"], tone: "blue" },
  { key: "customsCleared", stages: ["customsCleared"], tone: "gold" },
  { key: "receivedWarehouse", stages: ["receivedWarehouse"], tone: "green" },
  { key: "exceptions", stages: ["issueDetected", "rejected"], tone: "red" },
];

export default function ImportOrders() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const runAction = useRunAction();
  const { canViewSensitive, can } = useRole();
  const { importOrders: rows, updateImportOrder } = useData();
  const location = useLocation();
  const highlightOrderNo = (location.state as { highlightOrderNo?: string } | null)?.highlightOrderNo;
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingNo, setEditingNo] = useState<string | null>(null);
  const [editedNos, setEditedNos] = useState<Set<string>>(new Set());
  const [view, setView] = useViewMode<View>("import-orders", VIEWS, "table");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((o) => {
      const matchesSearch =
        !q || o.orderNo.toLowerCase().includes(q) || o.supplier.toLowerCase().includes(q);
      const matchesStatus = !statusFilter || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const editingRow = rows.find((o) => o.orderNo === editingNo) ?? null;

  const fields: FieldConfig[] = editingRow
    ? [
        { key: "etaDate", label: t("importOrders.col.etaDate"), type: "date" },
      ]
    : [];

  const handleSave = async (values: Record<string, FieldValue>) => {
    if (!editingRow) return;
    const result = await updateImportOrder(editingRow.orderNo, { etaDate: String(values.etaDate) });
    if (!await runAction(result, `${t("common.save")}: ${editingRow.orderNo}`)) return;
    setEditedNos((prev) => new Set(prev).add(editingRow.orderNo));
    setEditingNo(null);
  };

  const handleExport = () => {
    exportToExcel(
      "import-orders",
      [both("importOrders.col.orderNo"), both("importOrders.col.supplier"), both("importOrders.col.country"), both("importOrders.col.incoterms"), both("importOrders.col.orderDate"), both("importOrders.col.etaDate"), both("importOrders.col.totalValue"), both("importOrders.col.status"), both("importOrders.col.approver")],
      filtered.map((o) => [o.orderNo, o.supplier, t(`lookup.country.${o.country}`), o.incoterms, o.orderDate, o.etaDate, maskIfRestricted(o.totalValue, canViewSensitive), t(`status.${o.status}`), o.approver ? bi(o.approver) : ""]),
    );
  };

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <PageHeader title={t("importOrders.title")} subtitle={t("importOrders.subtitle")} />
        {can("createImportOrder") ? (
          <Link
            to="/import-orders/new"
            data-shortcut="new"
            aria-keyshortcuts="n"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            <Plus size={15} />
            {t("importOrders.newOrder")}
          </Link>
        ) : (
          <button
            disabled
            title={t("erp.noPermission")}
            className="flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-lg bg-gray-200 px-3.5 py-2 text-sm font-medium text-gray-400"
          >
            <Lock size={15} />
            {t("importOrders.newOrder")}
          </button>
        )}
      </div>

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("importOrders.searchPlaceholder")}
        statusValue={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={STATUS_OPTIONS.map((s) => ({ value: s, label: t(`status.${s}`) }))}
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

      {view === "board" && (
        <KanbanBoard
          columns={BOARD.map((c) => {
            const inStage = filtered.filter((o) => c.stages.includes(importStage(o)));
            // Received orders are finished: the board keeps the last 30 days. Rejected and flagged
            // orders stay — someone still has to correct and resubmit them.
            const finished = c.key === "receivedWarehouse";
            const since = addDays(todayIso(), -BOARD_RECENT_DAYS);
            const items = finished ? inStage.filter((o) => stageReachedOn(o, o.receiving?.receivedDate ?? o.etaDate) >= since) : inStage;
            return {
              key: c.key,
              label: t(c.key === "exceptions" ? "views.exceptions" : `status.${c.key}`),
              tone: c.tone,
              items,
              olderHidden: finished ? inStage.length - items.length : undefined,
              footer: <Masked>฿{formatCurrency(items.reduce((sum, o) => sum + o.totalValue, 0), lang)}</Masked>,
            };
          })}
          itemKey={(o) => o.orderNo}
          renderCard={(o) => <ImportCard order={o} highlight={o.orderNo === highlightOrderNo} />}
        />
      )}

      {view === "calendar" && (
        <CalendarView
          events={importEvents(filtered, t)}
          legend={<CalendarLegend items={[{ key: "eta", label: t("calendar.kind.eta"), tone: "blue" }]} />}
        />
      )}

      {view === "table" && (
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("importOrders.col.orderNo")}</th>
            <th className={th}>{t("importOrders.col.supplier")}</th>
            <th className={th}>{t("importOrders.col.country")}</th>
            <th className={th}>{t("importOrders.col.incoterms")}</th>
            <th className={th}>{t("importOrders.col.orderDate")}</th>
            <th className={th}>{t("importOrders.col.etaDate")}</th>
            <th className={th}>{t("importOrders.col.totalValue")}</th>
            <th className={th}>{t("importOrders.col.status")}</th>
            <th className={th}>{t("importOrders.col.approver")}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.length === 0 && <EmptyRow colSpan={10} />}
          {filtered.map((o) => (
            <tr key={o.orderNo} className={`hover:bg-gray-50/60 ${o.orderNo === highlightOrderNo ? "bg-indigo-50/40" : ""}`}>
              <td className={`${td} whitespace-nowrap`}>
                <RecordLink to={paths.importOrder(o.orderNo)} testid="order-link">
                  {o.orderNo}
                </RecordLink>
                {o.orderNo === highlightOrderNo && <EditedPill label={t("common.new")} />}
                {editedNos.has(o.orderNo) && <EditedPill />}
              </td>
              <td className={td}>{o.supplier}</td>
              <td className={td}>{t(`lookup.country.${o.country}`)}</td>
              <td className={td}>{o.incoterms}</td>
              <td className={td}>{formatDate(o.orderDate, lang)}</td>
              <td className={td}>
                {formatDate(o.etaDate, lang)}
                {isImportOverdue(o) && (
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">
                    {t("erp.overdue")}
                  </span>
                )}
              </td>
              <td className={td}>
                <Masked>฿{formatCurrency(o.totalValue, lang)}</Masked>
              </td>
              <td className={td}>
                <div className="flex flex-col gap-1">
                  <MiniStepper steps={importFlow(o)} />
                  {o.note && <span className="text-xs text-rose-500">{bi(o.note)}</span>}
                </div>
              </td>
              <td className={td}>{o.approver ? bi(o.approver) : <span className="text-gray-400">{t("importOrders.none")}</span>}</td>
              <td className={td}>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingNo(o.orderNo)}
                    disabled={!can("editImportOrder") || o.status === "receivedWarehouse"}
                    title={!can("editImportOrder") ? t("erp.noPermission") : o.status === "receivedWarehouse" ? t("erp.closedOrderNote") : undefined}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
                  >
                    {can("editImportOrder") ? <Pencil size={13} /> : <Lock size={13} />}
                    {t("common.edit")}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </TableContainer>
      )}

      <EditDrawer
        open={editingNo !== null}
        title={t("importOrders.editTitle")}
        subtitle={editingRow ? `${editingRow.orderNo} · ${editingRow.supplier}` : ""}
        note={t("erp.importEditNote")}
        fields={fields}
        values={editingRow ? { etaDate: editingRow.etaDate } : {}}
        onClose={() => setEditingNo(null)}
        onSave={handleSave}
      />
    </div>
  );
}

/** When goods are due in: each order on its ETA — late if it has passed and nothing's been received. */
function importEvents(orders: ImportOrder[], t: (k: string) => string): CalendarEvent[] {
  const today = todayIso();
  return orders
    .filter((o) => importStage(o) !== "rejected")
    .map((o) => {
      const stage = importStage(o);
      const arrived = stage === "receivedWarehouse";
      return {
        id: `${o.orderNo}-eta`,
        date: o.etaDate,
        title: `${o.orderNo} · ${o.supplier}`,
        subtitle: t(`status.${stage}`),
        kind: t("calendar.kind.eta"),
        tone: "blue" as const,
        href: `/import-orders/${o.orderNo}`,
        done: arrived,
        late: !arrived && o.etaDate < today,
      };
    });
}

function ImportCard({ order: o, highlight }: { order: ImportOrder; highlight: boolean }) {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const today = todayIso();
  const days = Math.round((new Date(`${o.etaDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000);
  const open = !["receivedWarehouse", "rejected"].includes(o.status);
  return (
    <BoardCard highlight={highlight}>
      <div className="flex items-start justify-between gap-2">
        <Link to={`/import-orders/${o.orderNo}`} className="text-sm font-semibold text-gray-900 hover:text-indigo-600">
          {o.orderNo}
        </Link>
        <span className="text-xs text-gray-500">{t(`lookup.country.${o.country}`)}</span>
      </div>
      <p className="mt-0.5 truncate text-sm text-gray-700">{o.supplier}</p>
      <p className={`mt-1 text-xs ${open && days < 0 ? "font-medium text-rose-700" : "text-gray-500"}`}>
        <Ship size={12} className="mr-1 inline-block align-[-2px]" />
        ETA {formatDate(o.etaDate, lang)}
        {open && <> · {days < 0 ? t("views.daysLate").replace("{n}", String(-days)) : days === 0 ? t("calendar.today") : t("views.inDays").replace("{n}", String(days))}</>}
      </p>
      {o.note && <p className="mt-1 text-xs text-rose-600">{bi(o.note)}</p>}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <MiniStepper steps={importFlow(o)} showLabel={false} />
        <span className="text-sm font-semibold tabular-nums text-gray-900">
          <Masked>฿{formatCurrency(o.totalValue, lang)}</Masked>
        </span>
      </div>
    </BoardCard>
  );
}
