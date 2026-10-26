import type { MessageKey, Translate } from "@/i18n/messages";

/*
 * Reasons for a manual stock adjustment. stock_movements.reason holds the code
 * ("damaged"), or the code and the user's note ("damaged: dropped a box"), so
 * the history can show the reason in whichever language the reader uses.
 */

export const ADJUSTMENT_REASONS = ["damaged", "expired", "count_correction", "other"] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const ADJUSTMENT_DIRECTIONS = ["remove", "add"] as const;
export type AdjustmentDirection = (typeof ADJUSTMENT_DIRECTIONS)[number];

const REASON_LABELS: Record<AdjustmentReason, MessageKey> = {
  damaged: "inventory.reasonDamaged",
  expired: "inventory.reasonExpired",
  count_correction: "inventory.reasonCountCorrection",
  other: "inventory.reasonOther",
};

// Damage and expiry write-offs only ever take stock away.
const REMOVAL_ONLY: readonly AdjustmentReason[] = ["damaged", "expired"];

const NOTE_SEPARATOR = ": ";

export function reasonLabel(reason: AdjustmentReason, t: Translate): string {
  return t(REASON_LABELS[reason]);
}

/** Reasons that make sense for adding or for removing stock. */
export function reasonsFor(direction: AdjustmentDirection): AdjustmentReason[] {
  return ADJUSTMENT_REASONS.filter(
    (reason) => direction === "remove" || !REMOVAL_ONLY.includes(reason),
  );
}

/** Value to store in stock_movements.reason. */
export function encodeReason(reason: AdjustmentReason, note: string | null): string {
  return note ? `${reason}${NOTE_SEPARATOR}${note}` : reason;
}

/**
 * Text to show for a stored reason: adjustment codes are translated, anything
 * else (free text written by other parts of the app) is shown as it is.
 */
export function describeReason(stored: string | null, t: Translate): string | null {
  if (!stored) return null;
  const at = stored.indexOf(NOTE_SEPARATOR);
  const code = at === -1 ? stored : stored.slice(0, at);
  const reason = ADJUSTMENT_REASONS.find((r) => r === code);
  if (!reason) return stored;
  const label = reasonLabel(reason, t);
  return at === -1 ? label : `${label} — ${stored.slice(at + NOTE_SEPARATOR.length)}`;
}
