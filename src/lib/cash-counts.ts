import type { CashCounts } from "@/db/schema";
import { round2 } from "./utils";

/*
 * Notes and coins of a currency, for counting a drawer piece by piece.
 * Client-safe (no database imports). Currencies without a list are counted as
 * one typed total instead.
 */

export type Denomination = { value: number; kind: "note" | "coin" };

const DENOMINATIONS: Record<string, Denomination[]> = {
  THB: [
    { value: 1000, kind: "note" },
    { value: 500, kind: "note" },
    { value: 100, kind: "note" },
    { value: 50, kind: "note" },
    { value: 20, kind: "note" },
    { value: 10, kind: "coin" },
    { value: 5, kind: "coin" },
    { value: 2, kind: "coin" },
    { value: 1, kind: "coin" },
  ],
};

/** The currency's notes and coins, largest first, or null to count a typed total. */
export function denominationsFor(currency: string): Denomination[] | null {
  return DENOMINATIONS[currency] ?? null;
}

// Nobody counts more than this many of one note or coin.
export const MAX_PIECES = 100_000;

/**
 * Counts for the currency's denominations only, as whole numbers >= 0, or null
 * when the input is not a valid count. `notesOnly` refuses coins (cash drops).
 */
export function cleanCounts(
  input: unknown,
  denominations: Denomination[],
  notesOnly = false,
): CashCounts | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const allowed = new Map(denominations.map((d) => [String(d.value), d]));
  const out: CashCounts = {};
  for (const [key, raw] of Object.entries(input)) {
    const denomination = allowed.get(key);
    if (!denomination) return null;
    const pieces = typeof raw === "string" ? Number(raw) : raw;
    if (typeof pieces !== "number" || !Number.isInteger(pieces) || pieces < 0 || pieces > MAX_PIECES) {
      return null;
    }
    if (pieces === 0) continue;
    if (notesOnly && denomination.kind !== "note") return null;
    out[key] = pieces;
  }
  return out;
}

/** Value of the counted pieces. */
export function countsTotal(counts: CashCounts): number {
  return round2(
    Object.entries(counts).reduce((sum, [value, pieces]) => sum + Number(value) * pieces, 0),
  );
}
