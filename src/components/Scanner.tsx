import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

/** The browser's own barcode reader, where there is one (Chrome on Android and Mac). */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

const Detector = (): BarcodeDetectorCtor | null => (typeof window !== "undefined" && "BarcodeDetector" in window ? (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector : null);

/**
 * Whether this device has a camera the app may use. QR codes are read by the browser's own reader where
 * it has one, otherwise by a small built-in reader (Windows, iPhone…). The camera needs HTTPS or localhost.
 */
export const scannerAvailable = () => typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

type Read = (video: HTMLVideoElement) => Promise<string | null>;

/** A reader for this browser: the native one (QR and barcodes), or jsQR (QR codes) loaded on first use. */
async function makeReader(): Promise<Read> {
  const Native = Detector();
  if (Native) {
    const formats = ["qr_code", "code_128", "ean_13", "code_39"];
    const supported = (Native as unknown as { getSupportedFormats?: () => Promise<string[]> }).getSupportedFormats;
    const usable = supported ? (await supported().catch(() => [] as string[])).includes("qr_code") : true;
    if (usable) {
      const detector = new Native({ formats });
      return async (video) => (await detector.detect(video))[0]?.rawValue || null;
    }
  }
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!ctx || !w || !h) return null;
    // Large frames are scaled down: quicker, and a label held up to the camera is still plenty big.
    const scale = Math.min(1, 800 / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data || null;
  };
}

/** Reads one QR code (or barcode, where the browser can) with the camera — the back camera on a phone — then hands it over. */
export function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const { t } = useLanguage();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // The latest callback, so the page re-rendering doesn't restart the camera.
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);
  const noCamera = t("scan.noCamera");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer = 0;
    if (!scannerAvailable()) {
      setError(noCamera);
      return;
    }
    Promise.all([navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }), makeReader()])
      .then(async ([s, read]) => {
        stream = s;
        if (stopped || !video.current) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        video.current.srcObject = s;
        await video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          try {
            const code = await read(video.current);
            if (code) {
              stopped = true;
              onCodeRef.current(code);
              return;
            }
          } catch {
            // A frame that can't be read yet — keep trying.
          }
          timer = window.setTimeout(tick, 200);
        };
        void tick();
      })
      .catch(() => setError(noCamera));
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [noCamera]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("scan.scanLabel")}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      data-testid="scanner"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-xl bg-black">
        <video ref={video} className="aspect-[3/4] w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-10 rounded-lg border-2 border-white/70" />
        <p className="absolute inset-x-0 bottom-0 bg-black/60 px-4 py-3 text-center text-sm text-white" data-testid="scanner-message">
          {error ?? t("scan.point")}
        </p>
        <button onClick={onClose} className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white" aria-label={t("common.close")} autoFocus>
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
