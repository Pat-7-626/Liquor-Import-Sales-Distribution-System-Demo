import { useLanguage } from "../i18n/LanguageContext";

type Tone = "green" | "amber" | "red" | "blue" | "gray" | "indigo" | "gold";

const TONE_CLASSES: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  gray: "bg-gray-100 text-gray-600 ring-gray-500/20",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  gold: "bg-gold-100/70 text-gold-600 ring-gold-500/30",
};

const DOT_CLASSES: Record<Tone, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
  blue: "bg-blue-500",
  gray: "bg-gray-400",
  indigo: "bg-indigo-500",
  gold: "bg-gold-500",
};

const STATUS_TONE: Record<string, Tone> = {
  available: "green",
  lowStock: "amber",
  outOfStock: "red",

  staging: "gray",
  pendingApproval: "amber",
  approved: "blue",
  customsCleared: "gold",
  receivedWarehouse: "green",
  issueDetected: "red",
  rejected: "red",
  customsClearancePending: "gray",

  expired: "red",
  expiringSoon: "amber",
  normal: "green",

  nearLimit: "amber",
  overLimit: "red",
  noLicense: "gray",

  delivered: "green",
  inDelivery: "blue",
  pendingShipment: "gray",
  returned: "amber",
  damaged: "red",

  agingStart: "amber",
  agingLong: "red",
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  const tone = STATUS_TONE[status] ?? "gray";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium tracking-[0.01em] ring-1 ring-inset whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[tone]}`} />
      {t(`status.${status}`)}
    </span>
  );
}
