import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { branches, pharmacies, users } from "@/db/schema";
import { requiredId } from "@/lib/validation";

/** The pharmacy with this id, or the 404 page. Shared by the view and edit pages. */
export const loadPharmacy = cache(async (id: string) => {
  // Anything that is not a uuid would make Postgres raise instead of finding nothing.
  if (!requiredId.safeParse(id).success) notFound();
  const db = await getDb();
  const [pharmacy] = await db.select().from(pharmacies).where(eq(pharmacies.id, id)).limit(1);
  if (!pharmacy) notFound();
  return pharmacy;
});

/** The pharmacy's users. Explicit columns: the password hash never leaves the database. */
export async function loadPharmacyUsers(pharmacyId: string) {
  const db = await getDb();
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      branchName: branches.name,
    })
    .from(users)
    .leftJoin(branches, eq(branches.id, users.branchId))
    .where(eq(users.pharmacyId, pharmacyId))
    .orderBy(asc(users.createdAt));
}
