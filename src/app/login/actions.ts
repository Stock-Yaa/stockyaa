"use server";

import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getT } from "@/i18n/server";
import type { ActionState } from "@/lib/action";
import { createSession, destroySession, homePathFor } from "@/lib/auth";

export async function login(formData: FormData): Promise<ActionState> {
  const t = await getT();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { ok: false, message: t("auth.invalidCredentials") };
  }

  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Same message for unknown email, wrong password and disabled account.
  if (!user || !user.isActive || !(await compare(password, user.passwordHash))) {
    return { ok: false, message: t("auth.invalidCredentials") };
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await createSession(user);
  redirect(homePathFor(user));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
