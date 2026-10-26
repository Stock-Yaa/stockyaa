export const LOCALES = ["en", "th"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "stockyaa_locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  th: "ไทย",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
