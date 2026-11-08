import type { Pharmacy } from "@/db/schema";

/*
 * The pharmacy's cash drawer rules (set in Settings). Client-safe.
 */

export type CashRules = {
  /** A difference up to this only needs a reason. */
  minorTolerance: number;
  /** Beyond this a manager is notified and the drawer is blocked until they decide. */
  majorTolerance: number;
  /** Pay-outs above this need a manager. */
  payoutApprovalLimit: number;
  /** Recounts allowed when the count is out by more than minorTolerance. */
  recounts: number;
};

export function cashRulesOf(
  pharmacy: Pick<
    Pharmacy,
    "cashMinorTolerance" | "cashMajorTolerance" | "payoutApprovalLimit" | "cashRecounts"
  >,
): CashRules {
  return {
    minorTolerance: pharmacy.cashMinorTolerance,
    majorTolerance: pharmacy.cashMajorTolerance,
    payoutApprovalLimit: pharmacy.payoutApprovalLimit,
    recounts: pharmacy.cashRecounts,
  };
}

/**
 * How serious a closing difference is: balanced; minor (reason only); major
 * (recount, then manager review); severe (also blocks the drawer).
 */
export type VarianceLevel = "balanced" | "minor" | "major" | "severe";

export function varianceLevel(difference: number, rules: CashRules): VarianceLevel {
  const size = Math.abs(difference);
  if (size === 0) return "balanced";
  if (size <= rules.minorTolerance) return "minor";
  if (size <= rules.majorTolerance) return "major";
  return "severe";
}

/** True when another count is allowed after `attempts` counts with this difference. */
export function canRecount(difference: number, attempts: number, rules: CashRules): boolean {
  const level = varianceLevel(difference, rules);
  return (level === "major" || level === "severe") && attempts - 1 < rules.recounts;
}
