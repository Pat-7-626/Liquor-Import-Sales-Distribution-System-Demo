import { useEffect, useState } from "react";

/** A QR code as an embedded image (so it prints, and goes into emailed PDFs, without fetching anything). */
export function QrCode({ value, className = "h-28 w-28", testid, alt = "QR" }: { value: string; className?: string; testid?: string; alt?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then((q) => q.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M" }))
      .then((svg) => !cancelled && setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`));
    return () => {
      cancelled = true;
    };
  }, [value]);
  return src ? <img src={src} alt={alt} className={className} data-testid={testid} /> : <div className={`${className} rounded bg-gray-100`} />;
}
