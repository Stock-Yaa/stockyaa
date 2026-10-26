import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, Ban } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PageHeader } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { products, purchaseItems, purchases, suppliers } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { branchScope, inScope } from "@/lib/branches";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { round2 } from "@/lib/utils";
import { requiredId } from "@/lib/validation";
import { cancelPurchase } from "../actions";
import { ReceivePurchaseButton } from "../receive-form";
import { PurchaseStatusBadge } from "../status-badge";

export const generateMetadata = pageTitle("purchases.title");

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  const f = await getFormat(pharmacy);
  const { id } = await params;
  if (!requiredId.safeParse(id).success) notFound();
  const db = await getDb();

  const [purchase] = await db
    .select({
      id: purchases.id,
      reference: purchases.reference,
      supplierName: suppliers.name,
      supplierInvoice: purchases.supplierInvoice,
      status: purchases.status,
      total: purchases.total,
      notes: purchases.notes,
      orderedAt: purchases.orderedAt,
      receivedAt: purchases.receivedAt,
    })
    .from(purchases)
    .leftJoin(
      suppliers,
      and(eq(suppliers.id, purchases.supplierId), eq(suppliers.pharmacyId, pharmacy.id)),
    )
    // Another branch's purchase is not found.
    .where(and(eq(purchases.id, id), inScope(purchases, branchScope(branch))))
    .limit(1);
  if (!purchase) notFound();

  const items = await db
    .select({
      id: purchaseItems.id,
      productName: products.name,
      strength: products.strength,
      unit: products.unit,
      batchNumber: purchaseItems.batchNumber,
      expiryDate: purchaseItems.expiryDate,
      quantity: purchaseItems.quantity,
      costPrice: purchaseItems.costPrice,
    })
    .from(purchaseItems)
    .innerJoin(
      products,
      and(eq(products.id, purchaseItems.productId), eq(products.pharmacyId, pharmacy.id)),
    )
    .where(eq(purchaseItems.purchaseId, purchase.id))
    .orderBy(asc(products.name), asc(purchaseItems.id));

  const lines = items.map((item) => ({
    ...item,
    productName: [item.productName, item.strength].filter(Boolean).join(" "),
  }));
  const isOrdered = purchase.status === "ordered";

  const details = [
    { label: t("purchases.supplier"), value: purchase.supplierName ?? t("purchases.noSupplier") },
    { label: t("purchases.supplierInvoice"), value: purchase.supplierInvoice ?? "—" },
    { label: t("purchases.orderedAt"), value: f.dateTime(purchase.orderedAt) },
    { label: t("purchases.receivedAt"), value: f.dateTime(purchase.receivedAt) },
  ];

  return (
    <>
      <PageHeader title={purchase.reference}>
        <Link href="/purchases" className={buttonClass({ variant: "outline" })}>
          <ArrowLeft />
          {t("common.back")}
        </Link>
        {isOrdered && (
          <>
            <ConfirmButton
              action={cancelPurchase.bind(null, purchase.id, branch.id)}
              title={t("purchases.cancelTitle")}
              body={t("purchases.cancelBody")}
              confirmLabel={t("purchases.cancelConfirm")}
              cancelLabel={t("common.back")}
              variant="outline"
            >
              <Ban />
              {t("purchases.cancelOrder")}
            </ConfirmButton>
            <ReceivePurchaseButton
              purchaseId={purchase.id}
              lines={lines.map((line) => ({
                id: line.id,
                productName: line.productName,
                unit: line.unit,
                quantity: line.quantity,
                batchNumber: line.batchNumber,
                expiryDate: line.expiryDate,
              }))}
            />
          </>
        )}
      </PageHeader>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("purchases.details")}</CardTitle>
          <PurchaseStatusBadge status={purchase.status} />
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {details.map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="mt-0.5 break-words">{row.value}</dd>
              </div>
            ))}
            {purchase.notes && (
              <div className="min-w-0 sm:col-span-2 lg:col-span-4">
                <dt className="text-muted-foreground">{t("common.notes")}</dt>
                <dd className="mt-0.5 break-words whitespace-pre-line">{purchase.notes}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <h2 className="mb-3 text-base font-semibold">{t("purchases.items")}</h2>
      <Table>
        <THead>
          <tr>
            <TH>{t("purchases.product")}</TH>
            <TH>{t("purchases.batchNumber")}</TH>
            <TH>{t("purchases.expiryDate")}</TH>
            <TH className="text-right">{t("common.quantity")}</TH>
            <TH className="text-right">{t("purchases.costPrice")}</TH>
            <TH className="text-right">{t("purchases.lineTotal")}</TH>
          </tr>
        </THead>
        <TBody>
          {lines.map((line) => (
            <TR key={line.id}>
              <TD className="font-medium">{line.productName}</TD>
              <TD>{line.batchNumber ?? "—"}</TD>
              <TD className="whitespace-nowrap">{f.day(line.expiryDate)}</TD>
              <TD className="text-right whitespace-nowrap tabular-nums">
                {f.number(line.quantity)} {line.unit}
              </TD>
              <TD className="text-right tabular-nums">{f.money(line.costPrice)}</TD>
              <TD className="text-right tabular-nums">
                {f.money(round2(line.quantity * line.costPrice))}
              </TD>
            </TR>
          ))}
        </TBody>
        <tfoot className="border-t border-border bg-muted/50">
          <tr>
            <TD colSpan={5} className="text-right font-medium">
              {t("purchases.orderTotal")}
            </TD>
            <TD className="text-right text-base font-semibold tabular-nums">
              {f.money(purchase.total)}
            </TD>
          </tr>
        </tfoot>
      </Table>
    </>
  );
}
