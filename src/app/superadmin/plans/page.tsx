import { asc, count, eq } from "drizzle-orm";
import { Layers, Trash2 } from "lucide-react";
import { currencyOptions } from "@/lib/options";
import { Badge } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { pharmacies, plans } from "@/db/schema";
import { getLocale, getT } from "@/i18n/server";
import { requireSuperAdmin } from "@/lib/auth";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { deletePlan } from "./actions";
import { PlanFormButton } from "./plan-form";

export const generateMetadata = pageTitle("platform.plansTitle");

export default async function PlansPage() {
  await requireSuperAdmin();
  const [t, locale, f, db] = await Promise.all([getT(), getLocale(), getFormat(), getDb()]);

  const rows = await db
    .select({ plan: plans, pharmacyCount: count(pharmacies.id) })
    .from(plans)
    .leftJoin(pharmacies, eq(pharmacies.planId, plans.id))
    .groupBy(plans.id)
    .orderBy(asc(plans.sortOrder), asc(plans.name));

  const priceFormats = new Map(
    await Promise.all(
      [...new Set(rows.map((row) => row.plan.currency))].map(
        async (currency) => [currency, await getFormat(null, currency)] as const,
      ),
    ),
  );
  const nextSortOrder = rows.reduce((max, row) => Math.max(max, row.plan.sortOrder), 0) + 1;

  return (
    <>
      <PageHeader title={t("platform.plansTitle")} description={t("platform.plansDescription")}>
        <PlanFormButton
          currencyOptions={currencyOptions(locale)}
          nextSortOrder={nextSortOrder}
        />
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={t("platform.plansEmpty")}
          hint={t("platform.plansEmptyHint")}
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{t("common.name")}</TH>
              <TH className="text-right">{t("platform.priceMonthly")}</TH>
              <TH className="text-right">{t("billing.priceYearly")}</TH>
              <TH className="text-right">{t("platform.colBranches")}</TH>
              <TH className="text-right">{t("platform.colPharmacies")}</TH>
              <TH>{t("common.status")}</TH>
              <TH className="text-right">{t("platform.sortOrder")}</TH>
              <TH className="text-right">{t("common.actions")}</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map(({ plan, pharmacyCount }) => (
              <TR key={plan.id}>
                <TD>
                  <p className="font-medium">{plan.name}</p>
                  {plan.description && (
                    <p className="max-w-md text-xs text-muted-foreground">{plan.description}</p>
                  )}
                </TD>
                <TD className="text-right whitespace-nowrap tabular-nums">
                  {(priceFormats.get(plan.currency) ?? f).money(plan.priceMonthly)}
                </TD>
                <TD className="text-right whitespace-nowrap tabular-nums">
                  {plan.priceYearly === null
                    ? "—"
                    : (priceFormats.get(plan.currency) ?? f).money(plan.priceYearly)}
                </TD>
                <TD className="text-right tabular-nums">{f.number(plan.maxBranches)}</TD>
                <TD className="text-right tabular-nums">{f.number(pharmacyCount)}</TD>
                <TD>
                  <Badge tone={plan.isActive ? "success" : "muted"}>
                    {plan.isActive ? t("common.active") : t("common.inactive")}
                  </Badge>
                </TD>
                <TD className="text-right tabular-nums">{plan.sortOrder}</TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <PlanFormButton
                      plan={plan}
                      currencyOptions={currencyOptions(locale, plan.currency)}
                    />
                    <ConfirmButton
                      action={deletePlan.bind(null, plan.id)}
                      body={t("platform.deletePlanBody")}
                      variant="ghost"
                      size="icon"
                      aria-label={t("common.delete")}
                    >
                      <Trash2 />
                    </ConfirmButton>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
