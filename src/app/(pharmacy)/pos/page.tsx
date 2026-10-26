import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, customers, products } from "@/db/schema";
import { requirePharmacy } from "@/lib/auth";
import { branchScope } from "@/lib/branches";
import { addDays, todayInTimezone } from "@/lib/dates";
import { pageTitle } from "@/lib/metadata";
import { getNextExpiry, getSellableStock } from "@/lib/stock";
import { PosTerminal } from "./pos-terminal";

export const generateMetadata = pageTitle("pos.title");

export default async function PosPage() {
  const { pharmacy, branch } = await requirePharmacy();
  const scope = branchScope(branch);
  const db = await getDb();
  const today = todayInTimezone(pharmacy.timezone);

  const [productRows, stock, nextExpiry, customerRows, categoryRows] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        genericName: products.genericName,
        strength: products.strength,
        barcode: products.barcode,
        unit: products.unit,
        salePrice: products.salePrice,
        requiresPrescription: products.requiresPrescription,
        categoryId: products.categoryId,
      })
      .from(products)
      .where(and(eq(products.pharmacyId, pharmacy.id), eq(products.isActive, true)))
      .orderBy(asc(products.name)),
    getSellableStock(db, scope, today),
    getNextExpiry(db, scope, today),
    db
      .select({ id: customers.id, name: customers.name, phone: customers.phone })
      .from(customers)
      .where(eq(customers.pharmacyId, pharmacy.id))
      .orderBy(asc(customers.name)),
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.pharmacyId, pharmacy.id))
      .orderBy(asc(categories.name)),
  ]);

  // Batches expiring on or before this day get the "expiring soon" badge.
  const soon = addDays(today, pharmacy.expiryAlertDays);

  return (
    <PosTerminal
      products={productRows.map((p) => {
        const expiry = nextExpiry.get(p.id) ?? null;
        return {
          ...p,
          stock: stock.get(p.id) ?? 0,
          nextExpiry: expiry,
          expiresSoon: expiry !== null && expiry <= soon,
        };
      })}
      customers={customerRows}
      categories={categoryRows}
    />
  );
}
