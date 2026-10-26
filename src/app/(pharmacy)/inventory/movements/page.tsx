import { and, count, desc, eq } from "drizzle-orm";
import { ArrowLeft, History } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { FilterSelect, Pagination } from "@/components/ui/list-controls";
import { EmptyState, PageHeader, Toolbar } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { MOVEMENT_TYPES, batches, products, stockMovements, users } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { branchScope, inScope } from "@/lib/branches";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { PAGE_SIZE, pageCountOf, parsePage } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { describeReason } from "../reasons";

export const generateMetadata = pageTitle("inventory.movementsTitle");

type MovementType = (typeof MOVEMENT_TYPES)[number];

const TYPE_LABEL: Record<MovementType, MessageKey> = {
  opening: "inventory.typeOpening",
  purchase: "inventory.typePurchase",
  sale: "inventory.typeSale",
  refund: "inventory.typeRefund",
  adjustment: "inventory.typeAdjustment",
  transfer_out: "inventory.typeTransferOut",
  transfer_in: "inventory.typeTransferIn",
};

const TYPE_TONE: Record<MovementType, React.ComponentProps<typeof Badge>["tone"]> = {
  opening: "muted",
  purchase: "info",
  sale: "success",
  refund: "warning",
  adjustment: "default",
  transfer_out: "warning",
  transfer_in: "info",
};

export default async function StockMovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const { pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  const f = await getFormat(pharmacy);
  const { type: typeParam, page: pageParam } = await searchParams;
  const type = MOVEMENT_TYPES.find((value) => value === typeParam);
  const page = parsePage(pageParam);
  const db = await getDb();

  const where = and(
    inScope(stockMovements, branchScope(branch)),
    type ? eq(stockMovements.type, type) : undefined,
  );

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(stockMovements).where(where),
    db
      .select({
        id: stockMovements.id,
        createdAt: stockMovements.createdAt,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        reason: stockMovements.reason,
        productName: products.name,
        strength: products.strength,
        batchNumber: batches.batchNumber,
        userName: users.name,
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .leftJoin(batches, eq(stockMovements.batchId, batches.id))
      .leftJoin(users, eq(stockMovements.userId, users.id))
      .where(where)
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  return (
    <>
      <PageHeader
        title={t("inventory.movementsTitle")}
        description={t("inventory.movementsDescription")}
      >
        <Link href="/inventory" className={buttonClass({ variant: "outline" })}>
          <ArrowLeft />
          {t("inventory.backToStock")}
        </Link>
      </PageHeader>

      <Toolbar>
        <FilterSelect
          param="type"
          aria-label={t("inventory.filterType")}
          options={[
            { value: "", label: t("inventory.allTypes") },
            ...MOVEMENT_TYPES.map((value) => ({ value, label: t(TYPE_LABEL[value]) })),
          ]}
        />
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState
          icon={History}
          title={type ? t("common.noResults") : t("inventory.movementsEmpty")}
          hint={type ? t("inventory.noMatchHint") : t("inventory.movementsEmptyHint")}
        />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("common.date")}</TH>
                <TH>{t("inventory.product")}</TH>
                <TH>{t("inventory.batchNumber")}</TH>
                <TH>{t("inventory.type")}</TH>
                <TH className="text-right">{t("inventory.change")}</TH>
                <TH>{t("inventory.reason")}</TH>
                <TH>{t("inventory.user")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id}>
                  <TD className="whitespace-nowrap">{f.dateTime(row.createdAt)}</TD>
                  <TD>
                    <span className="font-medium">{row.productName}</span>
                    {row.strength && (
                      <span className="ml-2 text-xs text-muted-foreground">{row.strength}</span>
                    )}
                  </TD>
                  <TD>{row.batchNumber ?? "—"}</TD>
                  <TD>
                    <Badge tone={TYPE_TONE[row.type]}>{t(TYPE_LABEL[row.type])}</Badge>
                  </TD>
                  <TD
                    className={cn(
                      "text-right font-medium tabular-nums",
                      row.quantity > 0 && "text-success",
                      row.quantity < 0 && "text-destructive",
                    )}
                  >
                    {row.quantity > 0 ? "+" : ""}
                    {f.number(row.quantity)}
                  </TD>
                  <TD className="max-w-xs text-muted-foreground">
                    {describeReason(row.reason, t) ?? "—"}
                  </TD>
                  <TD>{row.userName ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageCount={pageCountOf(total)} />
        </>
      )}
    </>
  );
}
