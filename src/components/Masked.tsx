import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useRole } from "../state/RoleContext";

export function Masked({ children }: { children: ReactNode }) {
  const { canViewSensitive } = useRole();
  const { t } = useLanguage();

  if (canViewSensitive) return <>{children}</>;

  return (
    <span
      title={t("common.restrictedTooltip")}
      className="inline-flex items-center gap-1 text-gray-400"
    >
      <Lock size={11} />
      ••••••
    </span>
  );
}
