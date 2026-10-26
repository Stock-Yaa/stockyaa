import type { Locale } from "@/i18n/config";
import { now } from "@/lib/time";

/*
 * Currencies and time zones a pharmacy can be set to. Shared by the pharmacy
 * settings form and the super admin pharmacy forms; the server actions accept
 * only these values, so a pharmacy can never hold a code that Intl rejects.
 */

export const CURRENCIES = [
  "THB",
  "USD",
  "EUR",
  "GBP",
  "SGD",
  "MYR",
  "IDR",
  "VND",
  "PHP",
  "PKR",
  "INR",
  "BDT",
  "AED",
  "SAR",
  "JPY",
  "CNY",
  "HKD",
  "AUD",
] as const;

export const TIMEZONES = [
  "Asia/Bangkok",
  "Asia/Ho_Chi_Minh",
  "Asia/Jakarta",
  "Asia/Kuala_Lumpur",
  "Asia/Singapore",
  "Asia/Manila",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Yangon",
  "Asia/Dhaka",
  "Asia/Kolkata",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
] as const;

export type SelectOption = { value: string; label: string };

/** The listed values, plus `current` when the stored value is not one of them. */
function withCurrent(listed: readonly string[], current: string | undefined): string[] {
  return current && !listed.includes(current) ? [...listed, current] : [...listed];
}

/** Currency <option>s labelled like "THB · Thai Baht" in the given language. */
export function currencyOptions(locale: Locale, current?: string): SelectOption[] {
  const names = new Intl.DisplayNames([locale], { type: "currency" });
  return withCurrent(CURRENCIES, current).map((code) => {
    let name: string | undefined;
    try {
      name = names.of(code);
    } catch {
      // A stored code Intl does not accept: show it bare.
    }
    return { value: code, label: name && name !== code ? `${code} · ${name}` : code };
  });
}

/** Time zone <option>s labelled like "Asia/Bangkok (GMT+7)" with today's offset. */
export function timezoneOptions(current?: string): SelectOption[] {
  const at = now();
  return withCurrent(TIMEZONES, current).map((zone) => {
    const name = zone.replace(/_/g, " ");
    try {
      const offset = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "shortOffset" })
        .formatToParts(at)
        .find((part) => part.type === "timeZoneName")?.value;
      return { value: zone, label: offset && offset !== name ? `${name} (${offset})` : name };
    } catch {
      return { value: zone, label: name };
    }
  });
}
