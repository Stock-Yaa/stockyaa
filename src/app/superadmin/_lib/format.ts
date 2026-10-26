import type { Format } from "@/lib/format";
import { getFormat } from "@/lib/format-server";

/**
 * Formatters keyed by time zone, so that a list of pharmacies can show each
 * subscription end date in that pharmacy's own zone. For dates only: the
 * currency is whichever pharmacy in the zone came first.
 */
export async function formatsByZone(
  rows: { currency: string; timezone: string }[],
): Promise<Map<string, Format>> {
  const byZone = new Map<string, Format>();
  for (const row of rows) {
    if (!byZone.has(row.timezone)) byZone.set(row.timezone, await getFormat(row));
  }
  return byZone;
}
