import type { Branch, User } from "@/db/schema";
import type { Translate } from "@/i18n/messages";
import { canSwitchBranch } from "./active-branch";
import type { BranchScope } from "./branches";

/** Query parameter of the branch filter on the dashboard and reports. */
export const REPORT_BRANCH_PARAM = "branch";

export type ReportScope = {
  scope: BranchScope;
  /** The branch shown, or null for "All branches". */
  branch: Branch | null;
  /** Options for the branch filter; null when there is nothing to choose (staff, or one branch). */
  options: { value: string; label: string }[] | null;
};

/**
 * Which branches the dashboard and reports cover. Admins of a pharmacy with
 * several branches see all of them by default and may pick one with
 * `?branch=<id>`; everyone else sees the branch they work in.
 */
export function resolveReportScope(
  param: string | undefined,
  ctx: { user: Pick<User, "role">; branch: Branch; branches: Branch[] },
  t: Translate,
): ReportScope {
  const { user, branch, branches } = ctx;
  if (!canSwitchBranch(user) || branches.length < 2) {
    return { scope: { pharmacyId: branch.pharmacyId, branchId: branch.id }, branch, options: null };
  }
  const chosen = branches.find((b) => b.id === param) ?? null;
  return {
    scope: { pharmacyId: branch.pharmacyId, branchId: chosen?.id ?? null },
    branch: chosen,
    options: [
      { value: "", label: t("branches.allBranches") },
      ...branches.map((b) => ({ value: b.id, label: b.name })),
    ],
  };
}
