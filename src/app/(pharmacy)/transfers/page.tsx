import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ArrowRight, Plus, Send } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { FilterSelect, Pagination, SearchInput } from "@/components/ui/list-controls";
import { EmptyState, PageHeader, Toolbar } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { TRANSFER_STATUSES, branches, stockTransferItems, stockTransfers } from "@/db/schema";
import { getT } from "@/i18n/server";
import { canSwitchBranch } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { requireBranchFeatures } from "@/lib/branch-features";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { PAGE_SIZE, likePattern, pageCountOf, parsePage } from "@/lib/pagination";
import { TRANSFER_STATUS_LABELS, TRANSFER_STATUS_TONES } from "./status";

export const generateMetadata = pageTitle("transfers.title");

const fromBranch = alias(branches, "from_branch");
const toBranch = alias(branches, "to_branch");

/**
 * Transfers to and from the current branch. Admins can widen the list to
 * every branch of the pharmacy with `?scope=all`.
 */
export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dir?: string; status?: string; scope?: string; page?: string }>;
}) {
  const { user, pharmacy, branch, branches: available } = await requirePharmacy();
  const [t, f, db, params] = await Promise.all([
    getT(),
    getFormat(pharmacy),
    getDb(),
    searchParams,
  ]);
  await requireBranchFeatures(db, pharmacy);
  const page = parsePage(params.page);
  const status = TRANSFER_STATUSES.find((s) => s === params.status);
  const canWiden = canSwitchBranch(user) && available.length > 1;
  const all = canWiden && params.scope === "all";
  const dir = all ? undefined : params.dir === "in" || params.dir === "out" ? params.dir : undefined;
  const pattern = params.q ? likePattern(params.q) : null;

  const where = and(
    eq(stockTransfers.pharmacyId, pharmacy.id),
    all
      ? undefined
      : dir === "in"
        ? eq(stockTransfers.toBranchId, branch.id)
        : dir === "out"
          ? eq(stockTransfers.fromBranchId, branch.id)
          : or(eq(stockTransfers.fromBranchId, branch.id), eq(stockTransfers.toBranchId, branch.id)),
    status ? eq(stockTransfers.status, status) : undefined,
    pattern ? ilike(stockTransfers.reference, pattern) : undefined,
  );

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(stockTransfers).where(where),
    db
      .select({
        id: stockTransfers.id,
        reference: stockTransfers.reference,
        status: stockTransfers.status,
        sentAt: stockTransfers.sentAt,
        fromBranchId: stockTransfers.fromBranchId,
        toBranchId: stockTransfers.toBranchId,
        fromName: fromBranch.name,
        toName: toBranch.name,
      })
      .from(stockTransfers)
      .innerJoin(fromBranch, eq(fromBranch.id, stockTransfers.fromBranchId))
      .innerJoin(toBranch, eq(toBranch.id, stockTransfers.toBranchId))
      .where(where)
      .orderBy(desc(stockTransfers.sentAt), desc(stockTransfers.reference))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  // Units and value of each transfer shown on this page.
  const totals =
    rows.length === 0
      ? []
      : await db
          .select({
            transferId: stockTransferItems.transferId,
            units: sql<number>`sum(${stockTransferItems.quantity})`.mapWith(Number),
            value: sql<number>`sum(${stockTransferItems.quantity} * ${stockTransferItems.costPrice})`.mapWith(
              Number,
            ),
          })
          .from(stockTransferItems)
          .where(inArray(stockTransferItems.transferId, rows.map((r) => r.id)))
          .groupBy(stockTransferItems.transferId);
  const totalsBy = new Map(totals.map((row) => [row.transferId, row]));

  const filtered = Boolean(params.q || status || dir);

  return (
    <>
      <PageHeader title={t("transfers.title")} description={t("transfers.description")}>
        <Link href="/transfers/new" className={buttonClass()}>
          <Plus />
          {t("transfers.new")}
        </Link>
      </PageHeader>

      <Toolbar>
        <SearchInput placeholder={t("transfers.reference")} />
        {canWiden && (
          <FilterSelect
            param="scope"
            aria-label={t("branches.current")}
            options={[
              { value: "", label: `${t("transfers.thisBranch")}: ${branch.name}` },
              { value: "all", label: t("branches.allBranches") },
            ]}
          />
        )}
        {!all && (
          <FilterSelect
            param="dir"
            aria-label={t("transfers.direction")}
            options={[
              { value: "", label: t("transfers.directionAll") },
              { value: "in", label: t("transfers.incoming") },
              { value: "out", label: t("transfers.outgoing") },
            ]}
          />
        )}
        <FilterSelect
          param="status"
          aria-label={t("common.status")}
          options={[
            { value: "", label: t("transfers.allStatuses") },
            ...TRANSFER_STATUSES.map((s) => ({ value: s, label: t(TRANSFER_STATUS_LABELS[s]) })),
          ]}
        />
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState
          icon={Send}
          title={filtered ? t("common.noResults") : t("transfers.empty")}
          hint={
            filtered
              ? t("common.noResultsHint")
              : all
                ? t("transfers.emptyAll")
                : t("transfers.emptyHint")
          }
        />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("transfers.reference")}</TH>
                <TH>{t("transfers.sentAt")}</TH>
                <TH>
                  {t("transfers.from")} → {t("transfers.to")}
                </TH>
                <TH className="text-right">{t("transfers.units")}</TH>
                <TH className="text-right">{t("transfers.value")}</TH>
                <TH>{t("common.status")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => {
                const sums = totalsBy.get(row.id);
                const incoming = !all && row.toBranchId === branch.id;
                return (
                  <TR key={row.id}>
                    <TD className="font-medium">
                      <Link href={`/transfers/${row.id}`} className="text-primary hover:underline">
                        {row.reference}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap">{f.dateTime(row.sentAt)}</TD>
                    <TD>
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <span className={row.fromBranchId === branch.id ? "font-medium" : undefined}>
                          {row.fromName}
                        </span>
                        <ArrowRight className="size-3.5 text-muted-foreground" />
                        <span className={row.toBranchId === branch.id ? "font-medium" : undefined}>
                          {row.toName}
                        </span>
                        {!all && (
                          <Badge tone={incoming ? "info" : "muted"}>
                            {incoming ? t("transfers.incoming") : t("transfers.outgoing")}
                          </Badge>
                        )}
                      </span>
                    </TD>
                    <TD className="text-right tabular-nums">{f.number(sums?.units ?? 0)}</TD>
                    <TD className="text-right tabular-nums">{f.money(sums?.value ?? 0)}</TD>
                    <TD>
                      <Badge tone={TRANSFER_STATUS_TONES[row.status]}>
                        {t(TRANSFER_STATUS_LABELS[row.status])}
                      </Badge>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination page={page} pageCount={pageCountOf(total)} />
        </>
      )}
    </>
  );
}
