import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, KeyRound, Lock, LockOpen, Pencil, Plus, Power, ShieldCheck, X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useBi } from "../lib/useBi";
import { useRole } from "../state/RoleContext";
import { useToast } from "../components/Toast";
import { PageHeader } from "../components/PageHeader";
import { TableContainer, EmptyRow, th, td } from "../components/Table";
import { FieldLabel, inputClass, selectClass } from "../components/FormKit";
import { api, ApiError } from "../lib/api";
import { ROLE_PERMISSIONS, SENSITIVE_DATA_ROLES } from "../data/identities";
import type { Bilingual, Permission, Role } from "../data/types";

const ROLES: Role[] = ["seniorManager", "supervisor", "orderOfficer", "documentationOfficer", "warehouseOfficer", "taxOfficer", "salesOfficer", "distributionOfficer"];

/** Grouped the way the sidebar is, so the matrix reads module by module. */
const PERMISSION_GROUPS: { key: string; perms: Permission[] }[] = [
  { key: "sales", perms: ["createSalesOrder", "editSalesOrder", "recordPayment", "createCustomer", "editCustomerTerms", "managePricing"] },
  { key: "purchasing", perms: ["createImportOrder", "editImportOrder", "manageImportDocuments", "recordCustomsClearance", "manageSuppliers", "editLicense"] },
  { key: "inventory", perms: ["receiveGoods", "adjustInventory", "updateDelivery", "editProduct", "manageWarehouses", "manageReorder"] },
  { key: "admin", perms: ["manageTax", "manageCompany", "approve", "viewUsers", "manageUsers"] },
];

interface UserRow {
  key: string;
  role: Role;
  name: Bilingual;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  mustChangePassword: boolean;
  /** Set while repeated wrong passwords have locked the account. */
  lockedUntil: string | null;
}

/** 12 characters without look-alikes (0/O, 1/l/I), easy to read out or type from a note. */
function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

const errorOf = (e: unknown, lang: "th" | "en"): string => (e instanceof ApiError ? (e.bilingual?.[lang] ?? e.message) : String(e));

export default function Users() {
  const { t, lang } = useLanguage();
  const bi = useBi();
  const { can, identity, refreshIdentities } = useRole();
  const toast = useToast();
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const canManage = can("manageUsers");

  const load = useCallback(async () => {
    try {
      const res = await api<{ users: UserRow[] }>("/api/admin/users");
      setRows(res.users);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorOf(e, lang));
    }
  }, [lang]);
  useEffect(() => {
    if (can("viewUsers")) void load();
  }, [load, can]);

  /** Sends a change; on success reloads the list and the sign-in list, and confirms with a toast. */
  const send = async (path: string, method: string, body: unknown, done: string): Promise<boolean> => {
    try {
      const res = await api<{ error?: Bilingual }>(path, { method, body });
      if (res.error) {
        toast(res.error[lang], "error");
        return false;
      }
      toast(done);
      await load();
      refreshIdentities();
      return true;
    } catch (e) {
      toast(errorOf(e, lang), "error");
      return false;
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter(
      (u) => (!q || u.key.toLowerCase().includes(q) || u.name.en.toLowerCase().includes(q) || u.name.th.includes(search.trim())) && (!roleFilter || u.role === roleFilter),
    );
  }, [rows, search, roleFilter]);

  if (!can("viewUsers"))
    return (
      <div>
        <PageHeader title={t("users.title")} subtitle={t("users.subtitle")} />
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
          <Lock size={15} />
          {t("users.noAccess")}
        </p>
      </div>
    );

  const when = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : null;
  const activeCount = (rows ?? []).filter((u) => u.active).length;
  const tempCount = (rows ?? []).filter((u) => u.active && u.mustChangePassword).length;

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <PageHeader title={t("users.title")} subtitle={t("users.subtitle")} />
        {canManage && (
          <button
            onClick={() => setCreating(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            data-testid="new-user"
          >
            <Plus size={15} />
            {t("users.new")}
          </button>
        )}
      </div>

      {!canManage && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-600">
          <Lock size={14} />
          {t("users.viewOnly")}
        </p>
      )}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("users.search")} className={`${inputClass} sm:max-w-xs`} />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={`${selectClass} sm:w-auto`} aria-label={t("users.role")}>
          <option value="">{t("users.allRoles")}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`roles.${r}`)}
            </option>
          ))}
        </select>
        <span className="whitespace-nowrap text-sm text-gray-500">
          {t("users.counts").replace("{active}", String(activeCount)).replace("{temp}", String(tempCount))}
        </span>
      </div>

      {loadError && <p className="mb-4 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{loadError}</p>}

      <TableContainer>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            <th className={th}>{t("users.user")}</th>
            <th className={th}>{t("users.role")}</th>
            <th className={th}>{t("users.status")}</th>
            <th className={th}>{t("users.lastSignIn")}</th>
            <th className={th}>{t("users.passwordChanged")}</th>
            {canManage && <th className={th}></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows && filtered.length === 0 && <EmptyRow colSpan={canManage ? 6 : 5} />}
          {filtered.map((u) => {
            const self = u.key === identity.key;
            return (
              <tr key={u.key} className={`hover:bg-gray-50/60 ${u.active ? "" : "bg-gray-50/70 text-gray-400"}`} data-user={u.key}>
                <td className={td}>
                  <div className="flex items-center gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${u.active ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-500"}`}>
                      {initialsOf(u.name)}
                    </span>
                    <div className="min-w-0">
                      <p className={`font-medium ${u.active ? "text-gray-900" : "text-gray-500"}`}>
                        {bi(u.name)}
                        {self && <span className="ml-1.5 rounded-full bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gold-600">{t("users.you")}</span>}
                      </p>
                      <p className="text-xs text-gray-500">{u.key}</p>
                    </div>
                  </div>
                </td>
                <td className={td}>
                  <span className="inline-flex items-center gap-1.5">
                    {t(`roles.${u.role}`)}
                    {SENSITIVE_DATA_ROLES.has(u.role) && (
                      <span title={t("users.seesPrices")}>
                        <ShieldCheck size={14} className="text-gold-500" aria-label={t("users.seesPrices")} />
                      </span>
                    )}
                  </span>
                </td>
                <td className={td}>
                  {u.active && u.lockedUntil ? (
                    <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20" data-testid="locked">
                      {t("users.lockedUntil").replace("{time}", new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(u.lockedUntil)))}
                    </span>
                  ) : !u.active ? (
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-inset ring-gray-300">{t("users.disabled")}</span>
                  ) : u.mustChangePassword ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">{t("users.tempPassword")}</span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">{t("users.active")}</span>
                  )}
                </td>
                <td className={td}>{when(u.lastLoginAt) ?? <span className="text-gray-400">{t("users.never")}</span>}</td>
                <td className={td}>{when(u.passwordChangedAt) ?? <span className="text-gray-400">{t("users.initial")}</span>}</td>
                {canManage && (
                  <td className={td}>
                    <div className="relative flex items-center justify-end gap-0.5">
                      {u.lockedUntil && (
                        <ActionButton
                          onClick={() => void send(`/api/admin/users/${encodeURIComponent(u.key)}`, "PATCH", { unlock: true }, `${t("users.unlockedToast")}: ${u.key}`)}
                          icon={<LockOpen size={15} />}
                          label={t("users.unlock")}
                        />
                      )}
                      <ActionButton onClick={() => setEditing(u)} icon={<Pencil size={15} />} label={t("common.edit")} />
                      <ActionButton
                        onClick={() => setResetting(u)}
                        icon={<KeyRound size={15} />}
                        label={t("users.resetPassword")}
                        disabled={self || !u.active}
                        title={self ? t("users.useOwnChange") : !u.active ? t("users.enableFirst") : undefined}
                      />
                      <ActionButton
                        onClick={() => {
                          const msg = (u.active ? t("users.confirmDisable") : t("users.confirmEnable")).replace("{name}", bi(u.name));
                          if (window.confirm(msg))
                            void send(`/api/admin/users/${encodeURIComponent(u.key)}`, "PATCH", { active: !u.active }, `${u.active ? t("users.disabledToast") : t("users.enabledToast")}: ${u.key}`);
                        }}
                        icon={<Power size={15} />}
                        label={u.active ? t("users.disable") : t("users.enable")}
                        danger={u.active}
                        disabled={self}
                        title={self ? t("users.cantDisableSelf") : undefined}
                      />
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </TableContainer>

      <RoleMatrix />

      {creating && (
        <UserDialog
          title={t("users.new")}
          onClose={() => setCreating(false)}
          onSave={async (v) => {
            const ok = await send("/api/admin/users", "POST", { key: v.key, role: v.role, name: { th: v.nameTh, en: v.nameEn }, password: v.password }, `${t("users.createdToast")}: ${v.key}`);
            if (ok) setCreating(false);
            return ok;
          }}
        />
      )}
      {editing && (
        <UserDialog
          title={t("users.edit")}
          initial={editing}
          self={editing.key === identity.key}
          onClose={() => setEditing(null)}
          onSave={async (v) => {
            const ok = await send(
              `/api/admin/users/${encodeURIComponent(editing.key)}`,
              "PATCH",
              { role: v.role, name: { th: v.nameTh, en: v.nameEn } },
              `${t("common.save")}: ${editing.key}`,
            );
            if (ok) setEditing(null);
            return ok;
          }}
        />
      )}
      {resetting && (
        <ResetDialog
          user={resetting}
          onClose={() => setResetting(null)}
          onSave={(password) =>
            send(`/api/admin/users/${encodeURIComponent(resetting.key)}/password`, "POST", { password }, `${t("users.resetToast")}: ${resetting.key}`)
          }
        />
      )}
    </div>
  );
}

/** Icon button: the label is its tooltip and its accessible name, so three actions fit in a narrow column. */
function ActionButton({ onClick, icon, label, disabled, title, danger }: { onClick: () => void; icon: ReactNode; label: string; disabled?: boolean; title?: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={`rounded-lg p-1.5 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent ${
        danger ? "text-rose-700 hover:bg-rose-50" : "text-indigo-600 hover:bg-indigo-50"
      }`}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </button>
  );
}

/** "Wichai Thongdee (Distribution Officer)" → "WT"; a "Supervisor: " prefix and the role in brackets are skipped. */
const initialsOf = (name: Bilingual) =>
  name.en
    .replace(/\(.*\)/, "")
    .replace(/^[^:]*:\s*/, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase() || "?";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useLanguage();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="font-display text-xl font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} aria-label={t("common.close")} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  return (
    <label className="block">
      <FieldLabel>{t("users.tempPasswordLabel")}</FieldLabel>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} font-mono ${value.length > 0 && value.length < 8 ? "border-rose-400 bg-rose-50" : ""}`}
          data-testid="user-password"
          autoComplete="off"
        />
        <button type="button" onClick={() => onChange(generatePassword())} className="shrink-0 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">
          {t("users.generate")}
        </button>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          aria-label={t("users.copy")}
          title={t("users.copy")}
          className="shrink-0 rounded-lg border border-gray-300 px-2.5 text-gray-600 hover:bg-gray-50"
        >
          {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-500">{t("users.tempPasswordHint")}</p>
    </label>
  );
}

interface UserForm {
  key: string;
  role: Role;
  nameTh: string;
  nameEn: string;
  password: string;
}

function UserDialog({ title, initial, self, onClose, onSave }: { title: string; initial?: UserRow; self?: boolean; onClose: () => void; onSave: (v: UserForm) => Promise<boolean> }) {
  const { t } = useLanguage();
  const [v, setV] = useState<UserForm>({
    key: initial?.key ?? "",
    role: initial?.role ?? "salesOfficer",
    nameTh: initial?.name.th ?? "",
    nameEn: initial?.name.en ?? "",
    password: initial ? "" : generatePassword(),
  });
  const [saving, setSaving] = useState(false);
  const keyOk = /^[A-Za-z0-9._-]{2,32}$/.test(v.key);
  const ready = keyOk && v.nameTh.trim() && v.nameEn.trim() && (initial || v.password.length >= 8) && !saving;
  const set = (patch: Partial<UserForm>) => setV((x) => ({ ...x, ...patch }));

  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ready) return;
          setSaving(true);
          await onSave(v);
          setSaving(false);
        }}
      >
        <label className="block">
          <FieldLabel>{t("users.username")}</FieldLabel>
          <input
            value={v.key}
            onChange={(e) => set({ key: e.target.value.trim() })}
            disabled={Boolean(initial)}
            className={`${inputClass} disabled:bg-gray-50 disabled:text-gray-500 ${v.key && !keyOk ? "border-rose-400 bg-rose-50" : ""}`}
            data-testid="user-key"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-gray-500">{initial ? t("users.usernameFixed") : t("users.usernameRule")}</p>
        </label>
        <label className="block">
          <FieldLabel>{t("users.role")}</FieldLabel>
          <select value={v.role} onChange={(e) => set({ role: e.target.value as Role })} disabled={self} className={`${selectClass} disabled:bg-gray-50`} data-testid="user-role">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </select>
          {self && <p className="mt-1 text-xs text-gray-500">{t("users.cantChangeOwnRole")}</p>}
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <FieldLabel>{t("users.nameTh")}</FieldLabel>
            <input value={v.nameTh} onChange={(e) => set({ nameTh: e.target.value })} placeholder="นก ใจดี (พนักงานขาย)" className={inputClass} data-testid="user-name-th" />
          </label>
          <label className="block">
            <FieldLabel>{t("users.nameEn")}</FieldLabel>
            <input value={v.nameEn} onChange={(e) => set({ nameEn: e.target.value })} placeholder="Nok Jaidee (Sales Officer)" className={inputClass} data-testid="user-name-en" />
          </label>
        </div>
        {!initial && <PasswordField value={v.password} onChange={(password) => set({ password })} />}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={!ready}
            data-testid="user-save"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
          >
            {t("common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetDialog({ user, onClose, onSave }: { user: UserRow; onClose: () => void; onSave: (password: string) => Promise<boolean> }) {
  const { t } = useLanguage();
  const bi = useBi();
  const [password, setPassword] = useState(generatePassword);
  const [saving, setSaving] = useState(false);
  return (
    <Modal title={`${t("users.resetPassword")} · ${user.key}`} onClose={onClose}>
      <p className="mb-4 text-sm text-gray-600">{t("users.resetExplain").replace("{name}", bi(user.name))}</p>
      <PasswordField value={password} onChange={setPassword} />
      <div className="flex justify-end gap-2 pt-5">
        <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {t("common.cancel")}
        </button>
        <button
          disabled={password.length < 8 || saving}
          onClick={async () => {
            setSaving(true);
            const ok = await onSave(password);
            setSaving(false);
            if (ok) onClose();
          }}
          data-testid="reset-save"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
        >
          {t("users.setPassword")}
        </button>
      </div>
    </Modal>
  );
}

/** Who can do what: one column per role, one row per permission — the same table the server enforces. */
function RoleMatrix() {
  const { t } = useLanguage();
  return (
    <section className="mt-8 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">{t("users.matrixTitle")}</h3>
      <p className="mb-3 text-xs text-gray-500">{t("users.matrixSub")}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 pr-3 text-left text-xs font-medium text-gray-500" />
              {ROLES.map((r) => (
                <th key={r} className="px-1 py-2 text-center text-xs font-medium text-gray-600">
                  {t(`roles.${r}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100 bg-gold-100/30">
              <td className="py-1.5 pr-3 text-gray-700">
                <ShieldCheck size={13} className="mr-1 inline-block align-[-2px] text-gold-500" />
                {t("users.seesPrices")}
              </td>
              {ROLES.map((r) => (
                <MatrixCell key={r} on={SENSITIVE_DATA_ROLES.has(r)} />
              ))}
            </tr>
            {PERMISSION_GROUPS.map((g) => (
              <PermissionGroup key={g.key} label={t(`users.group.${g.key}`)} perms={g.perms} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PermissionGroup({ label, perms }: { label: string; perms: Permission[] }) {
  const { t } = useLanguage();
  return (
    <>
      <tr>
        <td colSpan={ROLES.length + 1} className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
          {label}
        </td>
      </tr>
      {perms.map((p) => (
        <tr key={p} className="border-b border-gray-100 last:border-0">
          <td className="py-1.5 pr-3 text-gray-700">{t(`perm.${p}`)}</td>
          {ROLES.map((r) => (
            <MatrixCell key={r} on={ROLE_PERMISSIONS[r].has(p)} />
          ))}
        </tr>
      ))}
    </>
  );
}

function MatrixCell({ on }: { on: boolean }) {
  return (
    <td className="px-1 py-1.5 text-center">
      {on ? <Check size={15} className="inline-block text-emerald-600" aria-label="✓" /> : <span className="text-gray-200" aria-hidden="true">·</span>}
    </td>
  );
}
