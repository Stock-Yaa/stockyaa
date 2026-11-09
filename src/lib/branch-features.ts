import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { DbOrTx } from "@/db";
import { branches, type Pharmacy } from "@/db/schema";
import { planLimits } from "./branches";

/**
 * Whether the pharmacy gets the multi-branch pages (transfers, stock by
 * branch): on a multi-branch plan, or while it still runs several active
 * branches after moving down to a single-branch plan. The same rule decides
 * which links the pharmacy layout shows.
 */
export async function hasBranchFeatures(
  db: DbOrTx,
  pharmacy: Pick<Pharmacy, "id" | "planId">,
): Promise<boolean> {
  const [limits, activeBranches] = await Promise.all([
    planLimits(db, pharmacy),
    db.$count(branches, and(eq(branches.pharmacyId, pharmacy.id), eq(branches.isActive, true))),
  ]);
  return limits.multiBranch || activeBranches > 1;
}

/** "Not found" for a multi-branch page opened by address on a single-branch plan. */
export async function requireBranchFeatures(
  db: DbOrTx,
  pharmacy: Pick<Pharmacy, "id" | "planId">,
): Promise<void> {
  if (!(await hasBranchFeatures(db, pharmacy))) notFound();
}
