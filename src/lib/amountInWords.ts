// Amounts spelled out, as printed on Thai tax invoices and receipts ("หนึ่งพันบาทถ้วน").

const TH_DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const TH_PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/** Up to six digits (one "ล้าน" group). */
function thaiGroup(n: number): string {
  const digits = String(n);
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    const d = Number(digits[i]);
    const place = digits.length - 1 - i;
    if (d === 0) continue;
    if (place === 1 && d === 1) out += "สิบ";
    else if (place === 1 && d === 2) out += "ยี่สิบ";
    else if (place === 0 && d === 1 && n > 1) out += "เอ็ด";
    else out += TH_DIGITS[d] + TH_PLACES[place];
  }
  return out;
}

function thaiInteger(n: number): string {
  if (n === 0) return TH_DIGITS[0];
  const groups: number[] = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 1_000_000)) groups.unshift(rest % 1_000_000);
  return groups.map((g, i) => (g === 0 ? "" : thaiGroup(g)) + (i < groups.length - 1 ? "ล้าน" : "")).join("");
}

/** Thai baht text, e.g. 1,250.50 → "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์". */
export function thaiBahtText(amount: number): string {
  const satangTotal = Math.round(Math.abs(amount) * 100);
  const baht = Math.floor(satangTotal / 100);
  const satang = satangTotal % 100;
  const sign = amount < 0 ? "ลบ" : "";
  if (baht === 0 && satang > 0) return `${sign}${thaiInteger(satang)}สตางค์`;
  return `${sign}${thaiInteger(baht)}บาท${satang === 0 ? "ถ้วน" : `${thaiInteger(satang)}สตางค์`}`;
}

const EN_ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const EN_SCALES = ["", " thousand", " million", " billion"];

function enUnder1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) parts.push(`${EN_ONES[Math.floor(n / 100)]} hundred`);
  const r = n % 100;
  if (r > 0) parts.push(r < 20 ? EN_ONES[r] : EN_TENS[Math.floor(r / 10)] + (r % 10 ? `-${EN_ONES[r % 10]}` : ""));
  return parts.join(" ");
}

function enInteger(n: number): string {
  if (n === 0) return "zero";
  const parts: string[] = [];
  for (let scale = 0, rest = n; rest > 0; scale++, rest = Math.floor(rest / 1000)) {
    const chunk = rest % 1000;
    if (chunk) parts.unshift(enUnder1000(chunk) + EN_SCALES[scale]);
  }
  return parts.join(" ");
}

/** English amount, e.g. 1,250.50 → "One thousand two hundred fifty baht and fifty satang". */
export function englishBahtText(amount: number): string {
  const satangTotal = Math.round(Math.abs(amount) * 100);
  const baht = Math.floor(satangTotal / 100);
  const satang = satangTotal % 100;
  const text = `${amount < 0 ? "minus " : ""}${enInteger(baht)} baht${satang ? ` and ${enInteger(satang)} satang` : " only"}`;
  return text[0].toUpperCase() + text.slice(1);
}
