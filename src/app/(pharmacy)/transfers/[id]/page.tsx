import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ArrowLeft, Ban, PackageCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PageHeader } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { branches, products, stockTransferItems, stockTransfers, users } from "@/db/schema";
import { getT } from "@/i18n/server";
import { canSwitchBranch } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { round2 } from "@/lib/utils";
import { requiredId } from "@/lib/validation";
import { cancelTransfer, receiveTransfer } from "../actions";
import { TRANSFER_STATUS_LABELS, TRANSFER_STATUS_TONES } from "../status";

export const generateMetadata = pageTitle("transfers.title");

const fromBranch = alias(branches, "from_branch");
const toBranch = alias(branches, "to_branch");

/**
 * One transfer. Admins see any transfer of the pharmacy; staff only those to
 * or from their own branch. The receiving side can receive it, the sending
 * side can cancel it, while it is in transit.
 */
export default async function TransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, pharmacy, branch } = await requirePharmacy();
  const [t, f, db, { id }] = await Promise.all([getT(), getFormat(pharmacy), getDb(), params]);
  if (!requiredId.safeParse(id).success) notFound();

  const [transfer] = await db
    .select({
      id: stockTransfers.id,
      reference: stockTransfers.reference,
      status: stockTransfers.status,
      notes: stockTransfers.notes,
      sentAt: stockTransfers.sentAt,
      sentBy: stockTransfers.sentBy,
      closedAt: stockTransfers.closedAt,
      closedBy: stockTransfers.closedBy,
      fromBranchId: stockTransfers.fromBranchId,
      toBranchId: stockTransfers.toBranchId,
      fromName: fromBranch.name,
      toName: toBranch.name,
    })
    .from(stockTransfers)
    .innerJoin(fromBranch, eq(fromBranch.id, stockTransfers.fromBranchId))
    .innerJoin(toBranch, eq(toBranch.id, stockTransfers.toBranchId))
    .where(and(eq(stockTransfers.id, id), eq(stockTransfers.pharmacyId, pharmacy.id)))
    .limit(1);
  if (!transfer) notFound();
  const admin = canSwitchBranch(user);
  if (!admin && transfer.fromBranchId !== branch.id && transfer.toBranchId !== branch.id) {
    notFound();
  }

  const people = [transfer.sentBy, transfer.closedBy].filter((v): v is string => v !== null);
  const [items, names] = await Promise.all([
    db
      .select({
        id: stockTransferItems.id,
        productName: products.name,
        strength: products.strength,
        unit: products.unit,
        batchNumber: stockTransferItems.batchNumber,
        expiryDate: stockTransferItems.expiryDate,
        quantity: stockTransferItems.quantity,
        costPrice: stockTransferItems.costPrice,
      })
      .from(stockTransferItems)
      .innerJoin(
        products,
        and(eq(products.id, stockTransferItems.productId), eq(products.pharmacyId, pharmacy.id)),
      )
      .where(eq(stockTransferItems.transferId, transfer.id))
      .orderBy(asc(products.name), asc(stockTransferItems.expiryDate)),
    people.length === 0
      ? []
      : db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(and(inArray(users.id, people), eq(users.pharmacyId, pharmacy.id))),
  ]);
  const nameOf = (userId: string | null) =>
    names.find((u) => u.id === userId)?.name ?? "—";

  const inTransit = transfer.status === "in_transit";
  const canReceive = inTransit && (admin || transfer.toBranchId === branch.id);
  const canCancel = inTransit && (admin || transfer.fromBranchId === branch.id);
  const total = round2(items.reduce((sum, item) => sum + item.quantity * item.costPrice, 0));
  const units = items.reduce((sum, item) => sum + item.quantity, 0);

  const details = [
    { label: t("transfers.from"), value: transfer.fromName },
    { label: t("transfers.to"), value: transfer.toName },
    { label: t("transfers.sentAt"), value: f.dateTime(transfer.sentAt) },
    { label: t("transfers.sentBy"), value: nameOf(transfer.sentBy) },
    ...(transfer.status === "received"
      ? [
          { label: t("transfers.receivedAt"), value: f.dateTime(transfer.closedAt) },
          { label: t("transfers.receivedBy"), value: nameOf(transfer.closedBy) },
        ]
      : transfer.status === "cancelled"
        ? [
            { label: t("transfers.cancelledAt"), value: f.dateTime(transfer.closedAt) },
            { label: t("transfers.cancelledBy"), value: nameOf(transfer.closedBy) },
          ]
        : []),
  ];

  return (
    <>
      <PageHeader title={transfer.reference}>
        <Link href="/transfers" className={buttonClass({ variant: "outline" })}>
          <ArrowLeft />
          {t("common.back")}
        </Link>
        {canCancel && (
          <ConfirmButton
            action={cancelTransfer.bind(null, transfer.id)}
            title={t("transfers.cancelTitle")}
            body={t("transfers.cancelBody", { branch: transfer.fromName })}
            confirmLabel={t("transfers.cancel")}
            cancelLabel={t("common.back")}
            variant="outline"
          >
            <Ban />
            {t("transfers.cancel")}
          </ConfirmButton>
        )}
        {canReceive && (
          <ConfirmButton
            action={receiveTransfer.bind(null, transfer.id)}
            title={t("transfers.receiveTitle")}
            body={t("transfers.receiveBody", { branch: transfer.toName })}
            confirmLabel={t("transfers.receive")}
            destructive={false}
          >
            <PackageCheck />
            {t("transfers.receive")}
          </ConfirmButton>
        )}
      </PageHeader>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("transfers.details")}</CardTitle>
          <Badge tone={TRANSFER_STATUS_TONES[transfer.status]}>
            {t(TRANSFER_STATUS_LABELS[transfer.status])}
          </Badge>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {details.map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="mt-0.5 break-words">{row.value}</dd>
              </div>
            ))}
            {transfer.notes && (
              <div className="min-w-0 sm:col-span-2 lg:col-span-4">
                <dt className="text-muted-foreground">{t("common.notes")}</dt>
                <dd className="mt-0.5 break-words whitespace-pre-line">{transfer.notes}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <h2 className="mb-3 text-base font-semibold">{t("transfers.items")}</h2>
      <Table>
        <THead>
          <tr>
            <TH>{t("transfers.product")}</TH>
            <TH>{t("transfers.batchNumber")}</TH>
            <TH>{t("transfers.expiryDate")}</TH>
            <TH className="text-right">{t("common.quantity")}</TH>
            <TH className="text-right">{t("transfers.costPrice")}</TH>
            <TH className="text-right">{t("transfers.value")}</TH>
          </tr>
        </THead>
        <TBody>
          {items.map((item) => (
            <TR key={item.id}>
              <TD className="font-medium">
                {[item.productName, item.strength].filter(Boolean).join(" ")}
              </TD>
              <TD>{item.batchNumber ?? "—"}</TD>
              <TD className="whitespace-nowrap">{f.day(item.expiryDate)}</TD>
              <TD className="text-right whitespace-nowrap tabular-nums">
                {f.number(item.quantity)} {item.unit}
              </TD>
              <TD className="text-right tabular-nums">{f.money(item.costPrice)}</TD>
              <TD className="text-right tabular-nums">
                {f.money(round2(item.quantity * item.costPrice))}
              </TD>
            </TR>
          ))}
        </TBody>
        <tfoot className="border-t border-border bg-muted/50">
          <tr>
            <TD colSpan={3} className="text-right font-medium">
              {t("transfers.totalValue")}
            </TD>
            <TD className="text-right font-medium tabular-nums">{f.number(units)}</TD>
            <TD />
            <TD className="text-right text-base font-semibold tabular-nums">{f.money(total)}</TD>
          </tr>
        </tfoot>
      </Table>
    </>
  );
}
