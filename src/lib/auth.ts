import { createHash } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import {
  branches as branchesTable,
  pharmacies,
  users,
  type Branch,
  type Pharmacy,
  type User,
} from "@/db/schema";

const SESSION_COOKIE = "stockyaa_session";
/** The branch an admin last switched to (staff always work in their own). */
export const BRANCH_COOKIE = "stockyaa_branch";
const SESSION_DAYS = 7;

export type SessionUser = Omit<User, "passwordHash">;

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET is not set");
    }
    return new TextEncoder().encode("stockyaa-dev-secret-do-not-use-in-production");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Fingerprint of the password hash, stored in the session. Changing or
 * resetting a password changes it, which ends every session issued before.
 */
function passwordStamp(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

export async function createSession(user: Pick<User, "id" | "passwordHash">) {
  const token = await new SignJWT({ uid: user.id, pwd: passwordStamp(user.passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * The signed-in user, or null. Loaded from the database on every request so
 * that deactivating a user or changing their password takes effect immediately.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  let userId: string;
  let stamp: unknown;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.uid !== "string") return null;
    userId = payload.uid;
    stamp = payload.pwd;
  } catch {
    return null;
  }
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.isActive) return null;
  if (stamp !== passwordStamp(user.passwordHash)) return null;
  const sessionUser: Partial<User> = { ...user };
  delete sessionUser.passwordHash;
  return sessionUser as SessionUser;
});

/** Home page for a role. */
export function homePathFor(user: Pick<User, "role">): string {
  return user.role === "superadmin" ? "/superadmin" : "/dashboard";
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Use at the top of every super admin page and server action. */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "superadmin") redirect(homePathFor(user));
  return user;
}

/** True when the pharmacy may use the app: not suspended and subscription not lapsed. */
export function hasAccess(pharmacy: Pharmacy, now = new Date()): boolean {
  if (pharmacy.status !== "active") return false;
  if (pharmacy.subscriptionStatus === "cancelled") return false;
  if (pharmacy.subscriptionEndsAt && pharmacy.subscriptionEndsAt < now) return false;
  return true;
}

const loadPharmacy = cache(async (pharmacyId: string) => {
  const db = await getDb();
  const [pharmacy] = await db
    .select()
    .from(pharmacies)
    .where(eq(pharmacies.id, pharmacyId))
    .limit(1);
  return pharmacy ?? null;
});

const loadActiveBranches = cache(async (pharmacyId: string) => {
  const db = await getDb();
  const rows = await db
    .select()
    .from(branchesTable)
    .where(eq(branchesTable.pharmacyId, pharmacyId))
    .orderBy(asc(branchesTable.createdAt), asc(branchesTable.name));
  return rows.filter((b) => b.isActive);
});

/**
 * Use at the top of every pharmacy page and server action. Returns the
 * signed-in user, their pharmacy and the branch they are working in, plus the
 * branches they may switch to (only their own for staff). All queries must be
 * scoped to `pharmacy.id`, and queries on branch data (stock, sales,
 * purchases, cash) also to `branch.id`. Redirects to /subscription when the
 * pharmacy is suspended or its subscription has lapsed, unless
 * `allowInactive` is set.
 */
export async function requirePharmacy(options: { allowInactive?: boolean } = {}): Promise<{
  user: SessionUser;
  pharmacy: Pharmacy;
  branch: Branch;
  branches: Branch[];
}> {
  const user = await requireUser();
  if (user.role === "superadmin" || !user.pharmacyId) redirect(homePathFor(user));
  const pharmacy = await loadPharmacy(user.pharmacyId);
  if (!pharmacy) redirect("/login");

  const active = await loadActiveBranches(pharmacy.id);
  let branch: Branch | undefined;
  let available: Branch[];
  if (user.role === "admin") {
    const chosen = (await cookies()).get(BRANCH_COOKIE)?.value;
    branch = active.find((b) => b.id === chosen) ?? active[0];
    available = active;
  } else {
    branch = active.find((b) => b.id === user.branchId);
    available = branch ? [branch] : [];
  }
  // A staff member without a working branch, or a pharmacy without any.
  if (!branch) redirect("/no-branch");

  if (!options.allowInactive && !hasAccess(pharmacy)) redirect("/subscription");
  return { user, pharmacy, branch, branches: available };
}
