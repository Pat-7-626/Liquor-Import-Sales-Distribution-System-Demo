import { useState } from "react";
import { Pin, X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import type { ChannelCode } from "../data/types";
import { PageHeader } from "../components/PageHeader";
import { TableContainer, th, td } from "../components/Table";
import { Masked } from "../components/Masked";
import { inputClass } from "../components/FormKit";
import { formatCurrency } from "../lib/format";
import { computeChannelPrice } from "../lib/business";
import { exportToExcel } from "../lib/export";
import { useRunAction } from "../lib/useRunAction";
import { both } from "../i18n/translations";

export default function PriceLists() {
  const { t, lang } = useLanguage();
  const runAction = useRunAction();
  const { can, canViewSensitive } = useRole();
  const { priceLists, products, updatePriceList, setPriceOverride } = useData();
  const editable = can("managePricing");

  const [pctDrafts, setPctDrafts] = useState<Partial<Record<ChannelCode, string>>>({});
  const [overrideCell, setOverrideCell] = useState<{ channel: ChannelCode; sku: string; value: string } | null>(null);

  const savePct = async (channel: ChannelCode) => {
    const draft = pctDrafts[channel];
    if (draft === undefined) return;
    if (await runAction(updatePriceList(channel, Number(draft)), `${t("common.save")}: ${t(`lookup.channel.${channel}`)}`))
      setPctDrafts((d) => ({ ...d, [channel]: undefined }));
  };

  const saveOverride = async () => {
    if (!overrideCell) return;
    const price = overrideCell.value.trim() === "" ? null : Number(overrideCell.value);
    if (await runAction(setPriceOverride(overrideCell.channel, overrideCell.sku, price), `${t("common.save")}: ${overrideCell.sku}`)) setOverrideCell(null);
  };

  const handleExport = () =>
    exportToExcel(
      "price-lists",
      [both("products.col.sku"), both("products.col.name"), both("products.col.suggestedPrice"), ...priceLists.map((l) => both(`lookup.channel.${l.channel}`))],
      products.map((p) => [p.sku, p.name, p.suggestedPrice, ...priceLists.map((l) => computeChannelPrice(p, l.channel, priceLists))]),
    );

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <PageHeader title={t("erp.page.priceLists")} subtitle={t("erp.page.priceListsSub")} />
        <button
          onClick={handleExport}
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {t("common.export")}
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {priceLists.map((l) => {
          const draft = pctDrafts[l.channel];
          return (
            <div key={l.channel} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-gray-900">{t(`lookup.channel.${l.channel}`)}</p>
              <p className="mb-2 text-xs text-gray-400">
                {Object.keys(l.overrides).length} {t("erp.fixedPrices")}
              </p>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">{t("erp.adjustmentOnSuggested")}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={draft ?? String(l.adjustmentPercent)}
                    onChange={(e) => setPctDrafts((d) => ({ ...d, [l.channel]: e.target.value }))}
                    disabled={!editable}
                    className={`${inputClass} disabled:bg-gray-50`}
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </label>
              {draft !== undefined && Number(draft) !== l.adjustmentPercent && (
                <button
                  onClick={() => savePct(l.channel)}
                  className="mt-2 w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                >
                  {t("common.save")}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="mb-2 text-xs text-gray-400">{editable ? t("erp.priceGridHint") : t("erp.priceGridReadOnly")}</p>
      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("products.col.sku")}</th>
            <th className={th}>{t("products.col.name")}</th>
            <th className={th}>{t("products.col.costPrice")}</th>
            <th className={th}>{t("products.col.suggestedPrice")}</th>
            {priceLists.map((l) => (
              <th key={l.channel} className={th}>
                {t(`lookup.channel.${l.channel}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {products.map((p) => (
            <tr key={p.sku} className="hover:bg-gray-50/60">
              <td className={`${td} font-medium text-gray-900`}>{p.sku}</td>
              <td className={td}>{p.name}</td>
              <td className={td}>
                <Masked>฿{formatCurrency(p.costPrice, lang)}</Masked>
              </td>
              <td className={td}>฿{formatCurrency(p.suggestedPrice, lang)}</td>
              {priceLists.map((l) => {
                const price = computeChannelPrice(p, l.channel, priceLists);
                const fixed = l.overrides[p.sku] !== undefined;
                const belowCost = canViewSensitive && price < p.costPrice;
                const isEditing = overrideCell?.channel === l.channel && overrideCell.sku === p.sku;
                if (isEditing)
                  return (
                    <td key={l.channel} className={td}>
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          type="number"
                          value={overrideCell.value}
                          onChange={(e) => setOverrideCell({ ...overrideCell, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveOverride();
                            if (e.key === "Escape") setOverrideCell(null);
                          }}
                          placeholder={t("erp.blankUsesPercent")}
                          className={`${inputClass} w-28 py-1`}
                        />
                        <button onClick={saveOverride} className="rounded-lg bg-indigo-600 px-2 py-1 text-xs font-medium text-white">
                          OK
                        </button>
                        <button onClick={() => setOverrideCell(null)} aria-label={t("common.cancel")} className="text-gray-400 hover:text-gray-600">
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                  );
                return (
                  <td key={l.channel} className={td}>
                    <button
                      onClick={() => editable && setOverrideCell({ channel: l.channel, sku: p.sku, value: fixed ? String(l.overrides[p.sku]) : "" })}
                      disabled={!editable}
                      title={fixed ? t("erp.fixedPrice") : undefined}
                      className={`inline-flex items-center gap-1 rounded px-1 ${editable ? "hover:bg-indigo-50" : "cursor-default"} ${
                        belowCost ? "font-medium text-rose-600" : fixed ? "font-medium text-indigo-700" : "text-gray-700"
                      }`}
                    >
                      {fixed && <Pin size={11} />}฿{formatCurrency(price, lang)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </TableContainer>
      <p className="mt-2 text-xs text-gray-400">{t("erp.priceLegend")}</p>
    </div>
  );
}
