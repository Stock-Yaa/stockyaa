import { getLocale } from "@/i18n/server";
import { createFormat, type Format } from "./format";

/**
 * Formatters for server components. Pass the pharmacy so money and dates use
 * its currency and timezone; `currency` overrides the currency only.
 */
export async function getFormat(
  pharmacy?: { currency: string; timezone: string } | null,
  currency?: string,
): Promise<Format> {
  return createFormat(
    await getLocale(),
    currency ?? pharmacy?.currency,
    pharmacy?.timezone,
  );
}
