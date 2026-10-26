"use server";

import { compare, hash, truncates } from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "./action";
import { createSession, requireUser } from "./auth";
import { formToObject, requiredText } from "./validation";

// Actions on the caller's own user row; available to every role.

const nameSchema = z.object({ name: requiredText(100) });

/** Changes the caller's own display name. */
export async function updateAccountName(formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const t = await getT();

  const parsed = nameSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)),
    };
  }

  const db = await getDb();
  await db.update(users).set({ name: parsed.data.name }).where(eq(users.id, user.id));

  revalidatePath("/", "layout");
  return { ok: true, message: t("settings.nameSaved") };
}

const passwordSchema = z
  .object({
    currentPassword: z.string({ error: "common.required" }).min(1, "common.required"),
    // bcrypt only reads the first 72 bytes, so longer passwords are refused
    // rather than silently truncated.
    newPassword: z
      .string({ error: "common.required" })
      .min(8, "settings.passwordTooShort")
      .refine((v) => !truncates(v), "common.tooLong"),
    confirmPassword: z.string({ error: "common.required" }),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    error: "settings.passwordMismatch",
  });

/** Changes the caller's own password after checking the current one. */
export async function changePassword(formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const t = await getT();

  const parsed = passwordSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)),
    };
  }
  const { currentPassword, newPassword } = parsed.data;

  const db = await getDb();
  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row || !(await compare(currentPassword, row.passwordHash))) {
    return { ok: false, fieldErrors: { currentPassword: t("settings.currentPasswordWrong") } };
  }

  const passwordHash = await hash(newPassword, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
  // The change ends every existing session; start a new one for this browser.
  await createSession({ id: user.id, passwordHash });

  return { ok: true, message: t("settings.passwordChanged") };
}
