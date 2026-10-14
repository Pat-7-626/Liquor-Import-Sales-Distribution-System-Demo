import type { ReactNode } from "react";
import { CheckCircle2, Circle, XCircle } from "lucide-react";

export const selectClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-[inset_0_1px_2px_rgb(28_24_20/0.04)] transition-colors hover:border-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-3 focus:ring-indigo-500/15";
export const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-[inset_0_1px_2px_rgb(28_24_20/0.04)] transition-colors placeholder:text-gray-400 hover:border-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-3 focus:ring-indigo-500/15";

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-sm font-medium text-gray-600">{children}</span>;
}

export type CheckState = "ok" | "bad" | "pending";

export function CheckItem({ status, label }: { status: CheckState; label: string }) {
  const icon =
    status === "ok" ? (
      <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
    ) : status === "bad" ? (
      <XCircle size={16} className="shrink-0 text-rose-500" />
    ) : (
      <Circle size={16} className="shrink-0 text-gray-400" />
    );
  return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      {icon}
      <span className={status === "bad" ? "text-rose-600" : status === "pending" ? "text-gray-400" : "text-gray-700"}>
        {label}
      </span>
    </div>
  );
}
