import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

/** The browser's own barcode reader (Chrome on Android and most desktops; not iPhone Safari). */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

const Detector = (): BarcodeDetectorCtor | null => (typeof window !== "undefined" && "BarcodeDetector" in window ? (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector : null);

/** Whether this device can scan in the app. Elsewhere, a lot label's QR still opens the lot from any phone camera. */
export const scannerAvailable = () => Boolean(Detector() && typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia);

/** Reads one QR code or barcode with the camera (the back camera on a phone), then hands it over. */
export function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const { t } = useLanguage();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const Ctor = Detector();
    if (!Ctor) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer = 0;
    const detector = new Ctor({ formats: ["qr_code", "code_128", "ean_13", "code_39"] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(async (s) => {
        stream = s;
        if (stopped || !video.current) return;
        video.current.srcObject = s;
        await video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            if (found[0]?.rawValue) {
              stopped = true;
              onCode(found[0].rawValue);
              return;
            }
          } catch {
            // A frame that can't be read yet — keep trying.
          }
          timer = window.setTimeout(tick, 250);
        };
        tick();
      })
      .catch(() => setError(t("scan.noCamera")));
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [onCode, t]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label={t("scan.scanLabel")} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="relative w-full max-w-md overflow-hidden rounded-xl bg-black">
        <video ref={video} className="aspect-[3/4] w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-10 rounded-lg border-2 border-white/70" />
        <p className="absolute inset-x-0 bottom-0 bg-black/60 px-4 py-3 text-center text-sm text-white">{error ?? t("scan.point")}</p>
        <button onClick={onClose} className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white" aria-label={t("common.close")} autoFocus>
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
