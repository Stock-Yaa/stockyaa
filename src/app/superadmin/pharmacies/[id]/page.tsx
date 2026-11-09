import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, Pencil, Pill, Receipt, Store, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { SubscriptionBadge } from "@/components/subscription-badge";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { billingPayments, branches, plans, products, sales } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requireSuperAdmin } from "@/lib/auth";
import { todayInTimezone } from "@/lib/dates";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { stripeStatus } from "@/lib/platform";
import { STATE_LABEL, subscriptionState } from "@/lib/subscription";
import { now } from "@/lib/time";
import { EndDate } from "../../_components/end-date";
import { planPrices } from "../../_lib/plan-prices";
import { PaymentsTable } from "../../payments/payments-table";
import { moneyFormatsFor, paymentRows } from "../../payments/queries";
import { PharmacyRowActions } from "../row-actions";
import { loadPharmacy, loadPharmacyUsers } from "./load";

export const generateMetadata = pageTitle("platform.pharmaciesTitle");

/** One label/value line of a read-only details list. */
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm break-words sm:col-span-2">{children}</dd>
    </div>
  );
}

const dash = <span className="text-muted-foreground">—</span>;

/** Overview of a pharmacy, with the same actions as its row in the list. */
export default async function PharmacyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const pharmacy = await loadPharmacy(id);
  const db = await getDb();

  const [t, f, [plan], userRows, productCount, saleCount, branchCount, payments, planList] = await Promise.all([
    getT(),
    getFormat(pharmacy),
    pharmacy.planId
      ? db.select().from(plans).where(eq(plans.id, pharmacy.planId)).limit(1)
      : Promise.resolve([]),
    loadPharmacyUsers(pharmacy.id),
    db.$count(products, eq(products.pharmacyId, pharmacy.id)),
    db.$count(sales, eq(sales.pharmacyId, pharmacy.id)),
    db.$count(branches, and(eq(branches.pharmacyId, pharmacy.id), eq(branches.isActive, true))),
    paymentRows(db, eq(billingPayments.pharmacyId, pharmacy.id)).limit(20),
    db
      .select({
        id: plans.id,
        name: plans.name,
        isActive: plans.isActive,
        priceMonthly: plans.priceMonthly,
        priceYearly: plans.priceYearly,
        currency: plans.currency,
      })
      .from(plans)
      .orderBy(asc(plans.sortOrder), asc(plans.name)),
  ]);
  const prices = await planPrices(planList, t);

  const planFormat = plan ? await getFormat(null, plan.currency) : f;
  const paymentFormats = await moneyFormatsFor(payments, f);
  const state = subscriptionState(pharmacy, now());
  const branchLimit = plan?.maxBranches ?? 1;
  const roleLabel = (role: string) =>
    role === "admin" ? t("nav.pharmacyAdmin") : role === "manager" ? t("users.roleManager") : t("nav.staff");

  return (
    <>
      <Link
        href="/superadmin/pharmacies"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("platform.backToPharmacies")}
      </Link>
      <PageHeader
        title={pharmacy.name}
        description={`${t("platform.colCreated")}: ${f.date(pharmacy.createdAt)}`}
      >
        <SubscriptionBadge state={state} />
        <Link
          href={`/superadmin/pharmacies/${pharmacy.id}/edit`}
          className={buttonClass({ variant: "outline" })}
        >
          <Pencil />
          {t("platform.editDetails")}
        </Link>
        {/* Record payment, suspend / reactivate and delete, as in the list. */}
        <PharmacyRowActions
          pharmacy={{
            id: pharmacy.id,
            name: pharmacy.name,
            planId: pharmacy.planId,
            suspended: pharmacy.status !== "active",
          }}
          plans={prices}
          today={todayInTimezone(pharmacy.timezone)}
          stripeConfigured={stripeStatus().configured}
        />
      </PageHeader>

      <div className="grid gap-4 *:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("platform.colBranches")}
          value={t("platform.branchesUsed", {
            used: f.number(branchCount),
            limit: f.number(branchLimit),
          })}
          icon={Store}
          tone={branchCount > branchLimit ? "warning" : "default"}
        />
        <StatCard label={t("platform.usageProducts")} value={f.number(productCount)} icon={Pill} />
        <StatCard
          label={t("platform.usageSales")}
          value={f.number(saleCount)}
          icon={Receipt}
          tone="success"
        />
        <StatCard
          label={t("platform.usageUsers")}
          value={f.number(userRows.length)}
          icon={Users}
          tone="info"
        />
      </div>

      <div className="mt-4 grid items-start gap-4 *:min-w-0 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("platform.sectionPharmacy")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <dl className="divide-y divide-border">
              <Detail label={t("platform.pharmacyName")}>{pharmacy.name}</Detail>
              <Detail label={t("common.email")}>{pharmacy.email ?? dash}</Detail>
              <Detail label={t("common.phone")}>{pharmacy.phone ?? dash}</Detail>
              <Detail label={t("common.address")}>
                {pharmacy.address ? (
                  <span className="whitespace-pre-line">{pharmacy.address}</span>
                ) : (
                  dash
                )}
              </Detail>
              <Detail label={t("platform.licenseNumber")}>{pharmacy.licenseNumber ?? dash}</Detail>
              <Detail label={t("platform.currency")}>{pharmacy.currency}</Detail>
              <Detail label={t("platform.timezone")}>{pharmacy.timezone}</Detail>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("platform.sectionSubscription")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <dl className="divide-y divide-border">
              <Detail label={t("platform.plan")}>{plan ? plan.name : t("subscription.noPlan")}</Detail>
              {plan && (
                <Detail label={t("platform.priceMonthly")}>
                  {planFormat.money(plan.priceMonthly)}
                </Detail>
              )}
              {plan && plan.priceYearly !== null && (
                <Detail label={t("billing.priceYearly")}>{planFormat.money(plan.priceYearly)}</Detail>
              )}
              <Detail label={t("platform.maxBranches")}>
                {f.number(branchLimit)}
                {branchCount > branchLimit && (
                  <Badge tone="warning" className="ml-2">
                    {t("platform.overBranchLimit")}
                  </Badge>
                )}
              </Detail>
              <Detail label={t("common.status")}>{t(STATE_LABEL[state])}</Detail>
              <Detail label={t("platform.colValidUntil")}>
                <EndDate endsAt={pharmacy.subscriptionEndsAt} format={f} />
              </Detail>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t("billing.historyTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <EmptyState icon={Wallet} title={t("billing.historyEmpty")} />
          ) : (
            <PaymentsTable rows={payments} t={t} format={f} moneyFormats={paymentFormats} />
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t("platform.usersTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {userRows.length === 0 ? (
            <EmptyState icon={Users} title={t("platform.usersEmpty")} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t("common.name")}</TH>
                  <TH>{t("common.email")}</TH>
                  <TH>{t("platform.colRole")}</TH>
                  <TH>{t("platform.colBranch")}</TH>
                  <TH>{t("common.status")}</TH>
                  <TH>{t("platform.colLastLogin")}</TH>
                </tr>
              </THead>
              <TBody>
                {userRows.map((user) => (
                  <TR key={user.id}>
                    <TD className="font-medium">{user.name}</TD>
                    <TD>{user.email}</TD>
                    <TD>{roleLabel(user.role)}</TD>
                    <TD>{user.branchName ?? t("platform.allBranches")}</TD>
                    <TD>
                      <Badge tone={user.isActive ? "success" : "muted"}>
                        {user.isActive ? t("common.active") : t("common.inactive")}
                      </Badge>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {user.lastLoginAt ? (
                        f.dateTime(user.lastLoginAt)
                      ) : (
                        <span className="text-muted-foreground">
                          {t("platform.neverSignedIn")}
                        </span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
