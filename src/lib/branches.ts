import { and, asc, eq, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { DbOrTx } from "@/db";
import { branches, plans, type Branch, type Pharmacy } from "@/db/schema";

/**
 * Which branches a query covers: one branch, or every branch of the pharmacy
 * when `branchId` is null (the admin's "All branches" view).
 */
export type BranchScope = { pharmacyId: string; branchId: string | null };

/** The scope of a single branch. */
export const branchScope = (branch: Pick<Branch, "id" | "pharmacyId">): BranchScope => ({
  pharmacyId: branch.pharmacyId,
  branchId: branch.id,
});

/** SQL condition for a table that has pharmacy_id and branch_id columns. */
export function inScope(
  columns: { pharmacyId: PgColumn; branchId: PgColumn },
  scope: BranchScope,
): SQL {
  const pharmacy = eq(columns.pharmacyId, scope.pharmacyId);
  return scope.branchId ? and(pharmacy, eq(columns.branchId, scope.branchId))! : pharmacy;
}

/** Every branch of a pharmacy, active or not, in the order they were created. */
export function listBranches(db: DbOrTx, pharmacyId: string): Promise<Branch[]> {
  return db
    .select()
    .from(branches)
    .where(eq(branches.pharmacyId, pharmacyId))
    .orderBy(asc(branches.createdAt), asc(branches.name));
}

/**
 * What the pharmacy's plan allows. A Standard plan (or no plan) runs one
 * branch with one admin; a multi-branch plan runs up to `maxBranches`
 * branches with any number of admins (`maxAdmins` null).
 */
export type PlanLimits = { multiBranch: boolean; maxBranches: number; maxAdmins: number | null };

const STANDARD_LIMITS: PlanLimits = { multiBranch: false, maxBranches: 1, maxAdmins: 1 };

export async function planLimits(
  db: DbOrTx,
  pharmacy: Pick<Pharmacy, "planId">,
): Promise<PlanLimits> {
  if (!pharmacy.planId) return STANDARD_LIMITS;
  const [plan] = await db
    .select({ type: plans.type, maxBranches: plans.maxBranches })
    .from(plans)
    .where(eq(plans.id, pharmacy.planId))
    .limit(1);
  if (plan?.type !== "multi_branch") return STANDARD_LIMITS;
  return { multiBranch: true, maxBranches: plan.maxBranches, maxAdmins: null };
}

/** How many active branches the pharmacy's plan allows (1 on Standard or without a plan). */
export async function branchLimit(
  db: DbOrTx,
  pharmacy: Pick<Pharmacy, "planId">,
): Promise<number> {
  return (await planLimits(db, pharmacy)).maxBranches;
}

/** Message key for "your plan includes N branches", in the singular for one. */
export const limitReachedKey = (limit: number) =>
  limit === 1 ? ("branches.limitReachedOne" as const) : ("branches.limitReached" as const);
