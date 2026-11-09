import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, PackageX, Store } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { getDb } from "@/db";
import { products } from "@/db/schema";
import { getT } from "@/i18n/server";
import { canSwitchBranch } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { requireBranchFeatures } from "@/lib/branch-features";
import { branchScope, listBranches } from "@/lib/branches";
import { todayInTimezone } from "@/lib/dates";
import { pageTitle } from "@/lib/metadata";
import { getSellableStock } from "@/lib/stock";
import { TransferForm } from "../transfer-form";

export const generateMetadata = pageTitle("transfers.new");

/** Send stock from the current branch to another active branch of the pharmacy. */
export default async function NewTransferPage() {
  const { user, pharmacy, branch } = await requirePharmacy();
  const [t, db] = await Promise.all([getT(), getDb()]);
  await requireBranchFeatures(db, pharmacy);
  const today = todayInTimezone(pharmacy.timezone);

  const [allBranches, stock, productRows] = await Promise.all([
    listBranches(db, pharmacy.id),
    getSellableStock(db, branchScope(branch), today),
    db
      .select({
        id: products.id,
        name: products.name,
        strength: products.strength,
        unit: products.unit,
      })
      .from(products)
      .where(and(eq(products.pharmacyId, pharmacy.id), eq(products.isActive, true)))
      .orderBy(asc(products.name)),
  ]);

  // Staff only see their own branch elsewhere, but may send to any active one.
  const destinations = allBranches
    .filter((b) => b.isActive && b.id !== branch.id)
    .map((b) => ({ id: b.id, name: b.name }));
  const productOptions = productRows
    .filter((p) => (stock.get(p.id) ?? 0) > 0)
    .map((p) => ({
      id: p.id,
      label: [p.name, p.strength].filter(Boolean).join(" "),
      unit: p.unit,
      available: stock.get(p.id) ?? 0,
    }));

  return (
    <>
      <PageHeader
        title={t("transfers.new")}
        description={t("transfers.newDescription", { branch: branch.name })}
      >
        <Link href="/transfers" className={buttonClass({ variant: "outline" })}>
          <ArrowLeft />
          {t("common.back")}
        </Link>
      </PageHeader>

      {destinations.length === 0 ? (
        <EmptyState
          icon={Store}
          title={t("transfers.noOtherBranch")}
          hint={t("transfers.noOtherBranchHint")}
        >
          {canSwitchBranch(user) && (
            <Link href="/branches" className={buttonClass()}>
              {t("nav.branches")}
            </Link>
          )}
        </EmptyState>
      ) : productOptions.length === 0 ? (
        <EmptyState icon={PackageX} title={t("transfers.noStock")} hint={t("transfers.noStockHint")} />
      ) : (
        <TransferForm destinations={destinations} products={productOptions} />
      )}
    </>
  );
}
