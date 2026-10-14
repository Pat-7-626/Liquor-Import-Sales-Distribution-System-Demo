import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

type ToastTone = "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, tone }]);
    // Errors stay up longer — they usually explain what to fix.
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, tone === "error" ? 6000 : 2600);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-50 flex max-w-sm flex-col gap-2 print:hidden">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-2xl ring-1 ring-inset ${
              toast.tone === "error" ? "bg-rose-800 text-white ring-white/10" : "bg-ink-900 text-gold-100 ring-gold-400/20"
            }`}
          >
            {toast.tone === "error" ? (
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-200" />
            ) : (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-gold-400" />
            )}
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
