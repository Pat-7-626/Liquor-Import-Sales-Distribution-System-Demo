/**
 * PromptPay QR payloads (Thai QR Payment, EMVCo merchant-presented format) — what Thai banking apps scan.
 * The receiver is a mobile number or a 13-digit tax/citizen ID; with an amount the app pre-fills it.
 */

const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

/** CRC-16/CCITT-FALSE over the payload, as the spec requires (uppercase hex). */
function crc16(text: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** The receiver as PromptPay encodes it: a mobile number as 0066 + 9 digits, an ID as its 13 digits. */
function receiver(id: string): string | null {
  const digits = id.replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return field("01", `0066${digits.slice(1)}`);
  if (/^\d{13}$/.test(digits)) return field("02", digits);
  return null;
}

export function promptPayPayload(id: string, amount?: number): string | null {
  const who = receiver(id);
  if (!who) return null;
  const withAmount = amount !== undefined && amount > 0;
  const body =
    field("00", "01") +
    // 12 = a one-time code with an amount; 11 = reusable, the payer types the amount.
    field("01", withAmount ? "12" : "11") +
    field("29", field("00", "A000000677010111") + who) +
    field("58", "TH") +
    field("53", "764") +
    (withAmount ? field("54", amount.toFixed(2)) : "");
  const unsigned = `${body}6304`;
  return unsigned + crc16(unsigned);
}
