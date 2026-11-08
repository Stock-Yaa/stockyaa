/*
 * An amount in Thai words, as printed on Thai receipts and tax invoices:
 * 1,250.50 -> "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์", 100 -> "หนึ่งร้อยบาทถ้วน".
 */

const DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/**
 * Words for a whole number below one million (empty for 0). `afterHigher`:
 * a larger part precedes it (millions), so a final 1 is เอ็ด, as in 1,000,001.
 */
function belowMillion(n: number, afterHigher = false): string {
  const digits = String(n).split("").map(Number);
  let words = "";
  digits.forEach((digit, i) => {
    const place = digits.length - 1 - i;
    if (digit === 0) return;
    if (place === 1 && digit === 1) words += "สิบ";
    else if (place === 1 && digit === 2) words += "ยี่สิบ";
    else if (place === 0 && digit === 1 && (digits.length > 1 || afterHigher)) words += "เอ็ด";
    else words += DIGITS[digit] + PLACES[place];
  });
  return words;
}

/** Words for any whole number >= 0, grouping by ล้าน (million). */
function wholeNumber(n: number): string {
  if (n === 0) return "";
  const millions = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  return (millions > 0 ? `${wholeNumber(millions)}ล้าน` : "") + belowMillion(rest, millions > 0);
}

export function bahtText(amount: number): string {
  const satangTotal = Math.round(Math.abs(amount) * 100);
  const baht = Math.floor(satangTotal / 100);
  const satang = satangTotal % 100;
  const sign = amount < 0 ? "ลบ" : "";
  if (baht === 0 && satang === 0) return "ศูนย์บาทถ้วน";
  const bahtWords = baht > 0 ? `${wholeNumber(baht)}บาท` : "";
  const satangWords = satang > 0 ? `${belowMillion(satang)}สตางค์` : "ถ้วน";
  return sign + bahtWords + satangWords;
}
