import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useData } from "../state/DataContext";
import { useRole } from "../state/RoleContext";
import type { TaxSettings } from "../data/types";
import { PageHeader } from "../components/PageHeader";
import { FieldLabel, inputClass } from "../components/FormKit";
import { dutyRateFor } from "../lib/business";
import { useRunAction } from "../lib/useRunAction";

export default function TaxRates() {
  const { t } = useLanguage();
  const runAction = useRunAction();
  const { can } = useRole();
  const { taxSettings, products, updateTaxSettings } = useData();
  const editable = can("manageTax");
  const [draft, setDraft] = useState<TaxSettings>(taxSettings);
  // Reset the form whenever the saved settings change (save, reset demo data) — adjusted during render, not in an effect.
  const [base, setBase] = useState<TaxSettings>(taxSettings);
  if (base !== taxSettings) {
    setBase(taxSettings);
    setDraft(taxSettings);
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(taxSettings);
  const setRate = (idx: number, patch: Partial<TaxSettings["dutyRates"][number]>) =>
    setDraft((d) => ({ ...d, dutyRates: d.dutyRates.map((r, i) => (i === idx ? { ...r, ...patch } : r)) }));

  const handleSave = async () => {
    await runAction(updateTaxSettings({ ...draft, dutyRates: draft.dutyRates.map((r) => ({ ...r, hsPrefix: r.hsPrefix.trim(), label: r.label.trim() })) }), t("erp.taxSavedToast"));
  };

  const numberInput = (value: number, onChange: (n: number) => void, suffix: string) => (
    <div className="relative">
      <input
        type="number"
        min={0}
        step="0.1"
        value={value}
        disabled={!editable}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${inputClass} pr-16 disabled:bg-gray-50`}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-400">{suffix}</span>
    </div>
  );

  return (
    <div>
      <PageHeader title={t("erp.page.taxRates")} subtitle={t("erp.page.taxRatesSub")} />

      <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">{t("erp.taxRatesNote")}</p>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">{t("erp.generalRates")}</h3>
          <div className="space-y-4">
            <label className="block">
              <FieldLabel>{t("erp.vatRate")}</FieldLabel>
              {numberInput(draft.vatPercent, (n) => setDraft((d) => ({ ...d, vatPercent: n })), "%")}
            </label>
            <label className="block">
              <FieldLabel>{t("erp.exciseRate")}</FieldLabel>
              {numberInput(draft.exciseThbPerAbvLiter, (n) => setDraft((d) => ({ ...d, exciseThbPerAbvLiter: n })), t("erp.exciseUnit"))}
            </label>
            <label className="block">
              <FieldLabel>{t("erp.defaultDuty")}</FieldLabel>
              {numberInput(draft.defaultDutyPercent, (n) => setDraft((d) => ({ ...d, defaultDutyPercent: n })), "%")}
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">{t("erp.dutyByHs")}</h3>
            {editable && (
              <button
                onClick={() => setDraft((d) => ({ ...d, dutyRates: [...d.dutyRates, { hsPrefix: "", label: "", dutyPercent: d.defaultDutyPercent }] }))}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
              >
                <Plus size={13} />
                {t("erp.addRate")}
              </button>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">{t("erp.hsPrefix")}</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">{t("erp.description")}</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">{t("erp.dutyPercent")}</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">{t("erp.productsCovered")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {draft.dutyRates.map((r, idx) => {
                  const covered = products.filter((p) => r.hsPrefix && p.hsCode.startsWith(r.hsPrefix) && dutyRateFor(p.hsCode, draft) === r.dutyPercent);
                  return (
                    <tr key={idx}>
                      <td className="px-3 py-2">
                        <input value={r.hsPrefix} disabled={!editable} onChange={(e) => setRate(idx, { hsPrefix: e.target.value })} placeholder="2208.3" className={`${inputClass} w-28 py-1 font-mono disabled:bg-gray-50`} />
                      </td>
                      <td className="px-3 py-2">
                        <input value={r.label} disabled={!editable} onChange={(e) => setRate(idx, { label: e.target.value })} className={`${inputClass} py-1 disabled:bg-gray-50`} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} value={r.dutyPercent} disabled={!editable} onChange={(e) => setRate(idx, { dutyPercent: Number(e.target.value) })} className={`${inputClass} w-24 py-1 disabled:bg-gray-50`} />
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{covered.map((p) => p.sku).join(", ") || "—"}</td>
                      <td className="px-3 py-2">
                        {editable && (
                          <button
                            onClick={() => setDraft((d) => ({ ...d, dutyRates: d.dutyRates.filter((_, i) => i !== idx) }))}
                            aria-label={t("common.remove")}
                            className="text-gray-400 hover:text-rose-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-400">{t("erp.hsMatchNote")}</p>
        </div>
      </div>

      {editable && (
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => setDraft(taxSettings)}
            disabled={!dirty}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
          >
            {t("common.save")}
          </button>
        </div>
      )}
    </div>
  );
}
