"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getT } from "@/i18n/server";
import type { ActionState } from "./action";
import { canSwitchBranch } from "./active-branch";
import { BRANCH_COOKIE, requirePharmacy } from "./auth";

/** Makes another branch of the admin's pharmacy the one they work in. */
export async function switchBranch(branchId: string): Promise<ActionState> {
  const { user, branches } = await requirePharmacy({ allowInactive: true });
  const t = await getT();
  const target = branches.find((b) => b.id === branchId);
  if (!canSwitchBranch(user) || !target) return { ok: false, message: t("common.notFound") };

  (await cookies()).set(BRANCH_COOKIE, target.id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
  revalidatePath("/", "layout");
  return { ok: true, message: t("branches.switched", { name: target.name }) };
}
