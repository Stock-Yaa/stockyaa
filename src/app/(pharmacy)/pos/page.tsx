import { and, asc, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, customers, products, users } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { branchScope } from "@/lib/branches";
import { getDrawerState, payoutCategories } from "@/lib/cash-drawer";
import { mainPhotos } from "@/lib/product-images";
import { addDays, todayInTimezone } from "@/lib/dates";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { getNextExpiry, getSellableStock } from "@/lib/stock";
import { DrawerBar } from "./drawer-bar";
import { PosTerminal } from "./pos-terminal";

export const generateMetadata = pageTitle("pos.title");

export default async function PosPage() {
  const { pharmacy, branch } = await requirePharmacy();
  const scope = branchScope(branch);
  const [db, t, f] = await Promise.all([getDb(), getT(), getFormat(pharmacy)]);
  const today = todayInTimezone(pharmacy.timezone);

  const [productRows, stock, nextExpiry, customerRows, categoryRows, drawer, managers, photos] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        genericName: products.genericName,
        strength: products.strength,
        barcode: products.barcode,
        unit: products.unit,
        salePrice: products.salePrice,
        memberPrice: products.memberPrice,
        staffPrice: products.staffPrice,
        memberDiscount: products.memberDiscount,
        staffDiscount: products.staffDiscount,
        requiresPrescription: products.requiresPrescription,
        categoryId: products.categoryId,
      })
      .from(products)
      .where(and(eq(products.pharmacyId, pharmacy.id), eq(products.isActive, true)))
      .orderBy(asc(products.name)),
    getSellableStock(db, scope, today),
    getNextExpiry(db, scope, today),
    db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        priceLevel: customers.priceLevel,
        taxIdType: customers.taxIdType,
        taxId: customers.taxId,
        taxBranch: customers.taxBranch,
        address: customers.address,
      })
      .from(customers)
      .where(eq(customers.pharmacyId, pharmacy.id))
      .orderBy(asc(customers.name)),
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.pharmacyId, pharmacy.id))
      .orderBy(asc(categories.name)),
    getDrawerState(db, branch, t("cashDrawer.defaultDrawerName")),
    // Managers who can approve a large pay-out with their PIN.
    db
      .select({ id: users.id, name: users.name, hasPin: sql<boolean>`${users.pinHash} is not null` })
      .from(users)
      .where(
        and(
          eq(users.pharmacyId, pharmacy.id),
          eq(users.isActive, true),
          or(eq(users.role, "admin"), and(eq(users.role, "manager"), eq(users.branchId, branch.id))),
        ),
      )
      .orderBy(asc(users.name)),
    mainPhotos(db, pharmacy.id),
  ]);

  // Batches expiring on or before this day get the "expiring soon" badge.
  const soon = addDays(today, pharmacy.expiryAlertDays);
  // Cash goes into this till's drawer session; none while it is closed or being counted.
  const cashShiftId =
    drawer.shift && drawer.shift.countAttempts.length === 0 ? drawer.shift.id : null;

  // Expense categories a pay-out can be booked under.
  const payoutCats = await payoutCategories(db, pharmacy.id, [
    t("cashDrawer.payOut_supplies"),
    t("cashDrawer.payOut_transport"),
    t("cashDrawer.payOut_cleaning"),
    t("cashDrawer.payOut_other"),
  ]);

  return (
    <>
    <DrawerBar
      state={drawer}
      managers={managers}
      categories={payoutCats}
      approvalLimit={pharmacy.payoutApprovalLimit}
      t={t}
      f={f}
    />
    <PosTerminal
      cashShiftId={cashShiftId}
      products={productRows.map((p) => {
        const expiry = nextExpiry.get(p.id) ?? null;
        return {
          ...p,
          stock: stock.get(p.id) ?? 0,
          photoId: photos.get(p.id) ?? null,
          nextExpiry: expiry,
          expiresSoon: expiry !== null && expiry <= soon,
        };
      })}
      customers={customerRows}
      categories={categoryRows}
    />
    </>
  );
}
