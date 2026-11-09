import type { Branch, User } from "@/db/schema";

/*
 * Client-safe branch helpers (no database imports), shared by forms and
 * server actions. Query helpers live in ./branches.
 */

/** Admins work in every branch and may switch between them; managers and staff work in one. */
export const canSwitchBranch = (user: Pick<User, "role">) => user.role === "admin";

/**
 * Managers run the cash drawer (approve pay-outs, review counts, close
 * forgotten sessions, manage drawers): admins in every branch, a manager in
 * their own.
 */
export const isManager = (user: Pick<User, "role">) => user.role === "admin" || user.role === "manager";

/**
 * Name of the hidden field useFormAction adds to every pharmacy form: the
 * branch that was active when the page was rendered.
 */
export const ACTIVE_BRANCH_FIELD = "activeBranchId";

/**
 * True when a form was opened in another branch than the one now active (the
 * admin switched branch in another tab). Actions that change branch data
 * refuse such forms, so a sale or stock change never lands in the wrong branch.
 */
export function branchChanged(formData: FormData, branch: Pick<Branch, "id">): boolean {
  const sent = formData.get(ACTIVE_BRANCH_FIELD);
  return typeof sent === "string" && sent !== "" && sent !== branch.id;
}

/** Link that switches an admin to `branchId` and then opens `path` (see /branches/switch). */
export const switchBranchHref = (branchId: string, path: string) =>
  `/branches/switch?${new URLSearchParams({ to: branchId, next: path })}`;
