import { and, eq, gt, sql } from "drizzle-orm";
import { Power, PowerOff } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PageHeader } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { batches, users } from "@/db/schema";
import { getT } from "@/i18n/server";
import { canSwitchBranch } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { branchLimit, limitReachedKey, listBranches } from "@/lib/branches";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { setBranchActive } from "./actions";
import { BranchFormButton } from "./branch-form";

export const generateMetadata = pageTitle("branches.title");

/** The pharmacy's branches, for admins: add, rename and (de)activate them. */
export default async function BranchesPage() {
  const { user, pharmacy, branch: current } = await requirePharmacy();
  if (!canSwitchBranch(user)) notFound();
  const [t, f, db] = await Promise.all([getT(), getFormat(pharmacy), getDb()]);

  const [rows, limit, staffRows, stockRows] = await Promise.all([
    listBranches(db, pharmacy.id),
    branchLimit(db, pharmacy),
    db
      .select({ branchId: users.branchId, count: sql<number>`count(*)`.mapWith(Number) })
      .from(users)
      .where(and(eq(users.pharmacyId, pharmacy.id), eq(users.isActive, true)))
      .groupBy(users.branchId),
    db
      .select({
        branchId: batches.branchId,
        value: sql<number>`coalesce(sum(${batches.quantity} * ${batches.costPrice}), 0)`.mapWith(
          Number,
        ),
      })
      .from(batches)
      .where(and(eq(batches.pharmacyId, pharmacy.id), gt(batches.quantity, 0)))
      .groupBy(batches.branchId),
  ]);

  const staffBy = new Map(staffRows.map((r) => [r.branchId, r.count]));
  const stockBy = new Map(stockRows.map((r) => [r.branchId, r.value]));
  const used = rows.filter((b) => b.isActive).length;
  const full = used >= limit;

  return (
    <>
      <PageHeader title={t("branches.title")} description={t("branches.description")}>
        <BranchFormButton
          disabled={full}
          title={full ? t(limitReachedKey(limit), { limit }) : undefined}
        />
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-medium tabular-nums">
          {t("branches.usage", { used: f.number(used), limit: f.number(limit) })}
        </span>
        {full && (
          <span className="text-muted-foreground">
            {t(limitReachedKey(limit), { limit: f.number(limit) })}{" "}
            <Link href="/subscription" className="font-medium text-primary hover:underline">
              {t("branches.viewPlan")}
            </Link>
          </span>
        )}
      </div>

      <Table>
        <THead>
          <tr>
            <TH>{t("common.name")}</TH>
            <TH>{t("common.address")}</TH>
            <TH>{t("common.phone")}</TH>
            <TH className="text-right">{t("branches.colStaff")}</TH>
            <TH className="text-right">{t("branches.colStockValue")}</TH>
            <TH>{t("common.status")}</TH>
            <TH className="text-right">{t("common.actions")}</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((branch) => (
            <TR key={branch.id}>
              <TD>
                <span className="font-medium">{branch.name}</span>
                {branch.id === current.id && (
                  <Badge tone="info" className="ml-2">
                    {t("branches.currentBadge")}
                  </Badge>
                )}
              </TD>
              <TD className="max-w-xs">
                {branch.address ? (
                  <span className="line-clamp-2 whitespace-pre-line">{branch.address}</span>
                ) : (
                  "—"
                )}
              </TD>
              <TD className="whitespace-nowrap">{branch.phone ?? "—"}</TD>
              <TD className="text-right tabular-nums">
                {f.number(staffBy.get(branch.id) ?? 0)}
              </TD>
              <TD className="text-right whitespace-nowrap tabular-nums">
                {f.money(stockBy.get(branch.id) ?? 0)}
              </TD>
              <TD>
                <Badge tone={branch.isActive ? "success" : "muted"}>
                  {branch.isActive ? t("common.active") : t("common.inactive")}
                </Badge>
              </TD>
              <TD>
                <div className="flex justify-end gap-1">
                  <BranchFormButton branch={branch} />
                  {branch.isActive ? (
                    <ConfirmButton
                      action={setBranchActive.bind(null, branch.id, false)}
                      title={t("branches.deactivateTitle")}
                      body={t("branches.deactivateBody")}
                      confirmLabel={t("branches.deactivate")}
                      variant="ghost"
                      size="icon"
                      aria-label={t("branches.deactivate")}
                    >
                      <PowerOff />
                    </ConfirmButton>
                  ) : (
                    <ConfirmButton
                      action={setBranchActive.bind(null, branch.id, true)}
                      title={t("branches.activateTitle")}
                      body={t("branches.activateBody")}
                      confirmLabel={t("branches.activate")}
                      destructive={false}
                      variant="ghost"
                      size="icon"
                      aria-label={t("branches.activate")}
                      disabled={full}
                    >
                      <Power />
                    </ConfirmButton>
                  )}
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </>
  );
}
