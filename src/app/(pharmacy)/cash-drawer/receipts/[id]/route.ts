import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { cashMovements, cashShifts } from "@/db/schema";
import { canSwitchBranch } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { requiredId } from "@/lib/validation";
import { getFile } from "@/lib/storage";

/**
 * The receipt photo of a pay-out, from private storage. Managers see every
 * branch's (the review queue spans branches); staff only their branch's.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, pharmacy, branch } = await requirePharmacy();
  const { id } = await params;
  if (!requiredId.safeParse(id).success) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ path: cashMovements.receiptPath })
    .from(cashMovements)
    .innerJoin(cashShifts, eq(cashShifts.id, cashMovements.shiftId))
    .where(
      and(
        eq(cashMovements.id, id),
        eq(cashMovements.pharmacyId, pharmacy.id),
        eq(cashShifts.pharmacyId, pharmacy.id),
        canSwitchBranch(user) ? undefined : eq(cashShifts.branchId, branch.id),
      ),
    )
    .limit(1);
  // Keys are always "<pharmacyId>/…": a row can only point into its own pharmacy's files.
  if (!row?.path || !row.path.startsWith(`${pharmacy.id}/`)) notFound();
  const file = await getFile(row.path);
  if (!file) notFound();
  return new Response(Buffer.from(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
