import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { productImages } from "@/db/schema";
import { requirePharmacy } from "@/lib/auth";
import { getFile } from "@/lib/storage";
import { requiredId } from "@/lib/validation";

/**
 * A product photo from private storage, for signed-in users of its pharmacy.
 * A photo never changes under its id, so the browser may keep it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { pharmacy } = await requirePharmacy();
  const { id } = await params;
  if (!requiredId.safeParse(id).success) notFound();
  const db = await getDb();
  const [image] = await db
    .select({ path: productImages.path })
    .from(productImages)
    .where(and(eq(productImages.id, id), eq(productImages.pharmacyId, pharmacy.id)))
    .limit(1);
  // Keys are always "<pharmacyId>/…": a row can only point into its own pharmacy's files.
  if (!image || !image.path.startsWith(`${pharmacy.id}/`)) notFound();
  const file = await getFile(image.path);
  if (!file) notFound();
  return new Response(Buffer.from(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
