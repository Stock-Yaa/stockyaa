"use server";

import { compare } from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getT } from "@/i18n/server";
import type { ActionState } from "@/lib/action";
import { createSession, destroySession, homePathFor } from "@/lib/auth";
import { now } from "@/lib/time";

// Wrong passwords in a row before the account's sign-in is paused, and for how long.
const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MINUTES = 15;

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
  if (!user || !user.isActive) {
    return { ok: false, message: t("auth.invalidCredentials") };
  }

  // A paused account is refused even with the right password, so guessing
  // cannot carry on in the background.
  const current = now();
  if (user.loginLockedUntil && user.loginLockedUntil > current) {
    const minutes = Math.max(
      1,
      Math.ceil((user.loginLockedUntil.getTime() - current.getTime()) / 60_000),
    );
    return { ok: false, message: t("auth.tooManyAttempts", { minutes }) };
  }

  if (!(await compare(password, user.passwordHash))) {
    // Counted in the database, so parallel guesses cannot slip past the limit.
    const [after] = await db
      .update(users)
      .set({ loginFailures: sql`${users.loginFailures} + 1` })
      .where(eq(users.id, user.id))
      .returning({ failures: users.loginFailures });
    if (after && after.failures >= MAX_LOGIN_FAILURES) {
      await db
        .update(users)
        .set({
          loginFailures: 0,
          loginLockedUntil: sql`now() + make_interval(mins => ${LOGIN_LOCK_MINUTES})`,
        })
        .where(eq(users.id, user.id));
      return { ok: false, message: t("auth.tooManyAttempts", { minutes: LOGIN_LOCK_MINUTES }) };
    }
    return { ok: false, message: t("auth.invalidCredentials") };
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date(), loginFailures: 0, loginLockedUntil: null })
    .where(eq(users.id, user.id));
  await createSession(user);
  redirect(homePathFor(user));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
