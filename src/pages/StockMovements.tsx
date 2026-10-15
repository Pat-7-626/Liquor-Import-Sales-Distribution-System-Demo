import { useState } from "react";
import { Link } from "react-router-dom";
import { MovementReference, MovementTypeBadge } from "../components/MovementKit";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useData } from "../state/DataContext";
import type { StockMovement, StockMovementType } from "../data/types";
import { api } from "../lib/api";
import { query, useApi } from "../lib/useApi";
import { useDebounced } from "../lib/useDebounced";
import { Pager } from "../components/Pager";
import { PageHeader } from "../components/PageHeader";
import { Toolbar } from "../components/Toolbar";
import { TableContainer, EmptyRow, th, td } from "../components/Table";
import { inputClass, selectClass } from "../components/FormKit";
import { formatNumber } from "../lib/format";
import { exportToExcel } from "../lib/export";
import { useWarehouseName } from "../lib/useWarehouseName";
import { both } from "../i18n/translations";

const MOVEMENT_TYPES: StockMovementType[] = ["receipt", "sale", "return", "adjustment"];
const PAGE = 100;

interface MovementPage {
  rows: StockMovement[];
  total: number;
  unitsIn: number;
  unitsOut: number;
}

export default function StockMovements() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const warehouseName = useWarehouseName();
  const { warehouses, products } = useData();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const q = useDebounced(search.trim());

  // The ledger grows with every sale, so the server filters, totals and pages it. A change of filter starts at page one.
  const filters = { q, type: typeFilter, warehouse: warehouseFilter, from, to };
  const filterKey = JSON.stringify(filters);
  const [page, setPage] = useState({ key: filterKey, offset: 0 });
  const offset = page.key === filterKey ? page.offset : 0;
  const setOffset = (o: number) => setPage({ key: filterKey, offset: o });
  const { data } = useApi<MovementPage>(query("/api/stock-movements", { ...filters, offset, limit: PAGE }));
  const filtered = data?.rows ?? [];
  const totalIn = data?.unitsIn ?? 0;
  const totalOut = data?.unitsOut ?? 0;

  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

  return (
    <div>
      <PageHeader title={t("erp.page.stockMovements")} subtitle={t("erp.page.stockMovementsSub")} />
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("erp.searchMovements")}
        statusValue={typeFilter}
        onStatusChange={setTypeFilter}
        statusOptions={MOVEMENT_TYPES.map((m) => ({ value: m, label: t(`erp.movement.${m}`) }))}
        resultCount={data?.total ?? 0}
        totalCount={data?.total ?? 0}
        extraFilter={
          <>
            <select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)} aria-label={t("inventory.col.warehouse")} className={`${selectClass} sm:w-auto`}>
              <option value="">{t("erp.allWarehouses")}</option>
              {warehouses.map((w) => (
                <option key={w.code} value={w.code}>
                  {bi(w.name)}
                </option>
              ))}
            </select>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("erp.fromDate")} className={`${inputClass} sm:w-auto`} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("erp.toDate")} className={`${inputClass} sm:w-auto`} />
          </>
        }
        onExport={async () => {
          // Everything matching the filters (up to 5,000 rows), not just the page on screen.
          const all = await api<MovementPage>(query("/api/stock-movements", { ...filters, offset: 0, limit: 5000 }));
          exportToExcel(
            "stock-movements",
            [both("auditTrail.col.timestamp"), both("erp.movementType"), both("products.col.sku"), both("products.col.name"), both("inventory.col.lotBatch"), both("inventory.col.warehouse"), both("erp.quantity"), both("erp.reference"), both("auditTrail.col.actor")],
            all.rows.map((m) => [m.timestamp, t(`erp.movement.${m.type}`), m.sku, products.find((p) => p.sku === m.sku)?.name ?? "", m.lotBatch, warehouseName(m.warehouse), m.quantity, m.reference, bi(m.actor)]),
          );
        }}
      />

      <div className="mb-3 flex gap-4 text-sm text-gray-500">
        <span>
          {t("erp.totalIn")}: <span className="font-medium text-emerald-600">+{formatNumber(totalIn, lang, 0)}</span>
        </span>
        <span>
          {t("erp.totalOut")}: <span className="font-medium text-rose-600">−{formatNumber(totalOut, lang, 0)}</span>
        </span>
      </div>

      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("auditTrail.col.timestamp")}</th>
            <th className={th}>{t("erp.movementType")}</th>
            <th className={th}>{t("products.col.sku")}</th>
            <th className={th}>{t("inventory.col.lotBatch")}</th>
            <th className={th}>{t("inventory.col.warehouse")}</th>
            <th className={`${th} text-right`}>{t("erp.quantity")}</th>
            <th className={th}>{t("erp.reference")}</th>
            <th className={th}>{t("auditTrail.col.actor")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.length === 0 && <EmptyRow colSpan={8} />}
          {filtered.map((m) => (
            <tr key={m.id} className="hover:bg-gray-50/60">
              <td className={`${td} text-gray-500`}>{fmtTime(m.timestamp)}</td>
              <td className={td}>
                <MovementTypeBadge type={m.type} />
              </td>
              <td className={`${td} font-medium text-gray-900`}>{m.sku}</td>
              <td className={td}>
                <Link to={`/lot-trace?lot=${encodeURIComponent(m.lotBatch)}`} className="text-indigo-600 hover:underline">
                  {m.lotBatch}
                </Link>
              </td>
              <td className={td}>{warehouseName(m.warehouse)}</td>
              <td className={`${td} text-right font-medium ${m.quantity > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {m.quantity > 0 ? "+" : "−"}
                {formatNumber(Math.abs(m.quantity), lang, 0)}
              </td>
              <td className={`${td} max-w-xs truncate`}>
                <MovementReference reference={m.reference} />
              </td>
              <td className={td}>{bi(m.actor)}</td>
            </tr>
          ))}
        </tbody>
      </TableContainer>
      <Pager offset={offset} limit={PAGE} total={data?.total ?? 0} onChange={setOffset} />
    </div>
  );
}
