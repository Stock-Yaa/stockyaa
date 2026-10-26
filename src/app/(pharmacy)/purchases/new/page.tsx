import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, Pill } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { getDb } from "@/db";
import { products, suppliers } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { pageTitle } from "@/lib/metadata";
import { PurchaseForm } from "../purchase-form";

export const generateMetadata = pageTitle("purchases.new");

export default async function NewPurchasePage() {
  const { pharmacy, branch, branches } = await requirePharmacy();
  const t = await getT();
  const db = await getDb();

  const [supplierOptions, productOptions] = await Promise.all([
    db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.pharmacyId, pharmacy.id))
      .orderBy(asc(suppliers.name)),
    db
      .select({
        id: products.id,
        name: products.name,
        strength: products.strength,
        unit: products.unit,
        costPrice: products.costPrice,
      })
      .from(products)
      .where(and(eq(products.pharmacyId, pharmacy.id), eq(products.isActive, true)))
      .orderBy(asc(products.name)),
  ]);

  return (
    <>
      <PageHeader
        title={t("purchases.new")}
        description={
          // The order is for the current branch; say which when there is a choice.
          branches.length > 1
            ? t("purchases.newDescriptionBranch", { branch: branch.name })
            : t("purchases.newDescription")
        }
      >
        <Link href="/purchases" className={buttonClass({ variant: "outline" })}>
          <ArrowLeft />
          {t("common.back")}
        </Link>
      </PageHeader>

      {productOptions.length === 0 ? (
        <EmptyState
          icon={Pill}
          title={t("purchases.noProducts")}
          hint={t("purchases.noProductsHint")}
        >
          <Link href="/products" className={buttonClass()}>
            {t("nav.products")}
          </Link>
        </EmptyState>
      ) : (
        <PurchaseForm suppliers={supplierOptions} products={productOptions} />
      )}
    </>
  );
}
