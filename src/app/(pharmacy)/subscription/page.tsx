import { and, asc, eq, or } from "drizzle-orm";
import { CalendarClock, LifeBuoy, Lock, Store } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { getDb } from "@/db";
import { branches, plans } from "@/db/schema";
import { getT } from "@/i18n/server";
import { hasAccess, requirePharmacy } from "@/lib/auth";
import { PLAN_TYPE_LABEL } from "@/lib/billing-labels";
import { getFormat } from "@/lib/format-server";
import { now } from "@/lib/time";
import { daysLeftLabel, subscriptionState } from "@/lib/subscription";
import { SubscriptionBadge } from "@/components/subscription-badge";
import { pageTitle } from "@/lib/metadata";

export const generateMetadata = pageTitle("subscription.title");

export default async function SubscriptionPage() {
  // Blocked pharmacies are redirected here, so this page must render for them.
  const { pharmacy } = await requirePharmacy({ allowInactive: true });
  const t = await getT();
  const f = await getFormat(pharmacy);
  const db = await getDb();

  // Active plans for reference, plus the pharmacy's own plan even if it has
  // since been retired.
  const planRows = await db
    .select()
    .from(plans)
    .where(
      pharmacy.planId
        ? or(eq(plans.isActive, true), eq(plans.id, pharmacy.planId))
        : eq(plans.isActive, true),
    )
    .orderBy(asc(plans.sortOrder), asc(plans.name));

  const currentPlan = planRows.find((plan) => plan.id === pharmacy.planId) ?? null;
  const branchesInUse = await db.$count(
    branches,
    and(eq(branches.pharmacyId, pharmacy.id), eq(branches.isActive, true)),
  );
  const branchesIncluded = (count: number) =>
    count === 1
      ? t("subscription.branchIncluded")
      : t("subscription.branchesIncluded", { count: f.number(count) });
  const activePlans = planRows.filter((plan) => plan.isActive);
  const priceFormats = new Map(
    await Promise.all(
      [...new Set(planRows.map((plan) => plan.currency))].map(
        async (currency) => [currency, await getFormat(pharmacy, currency)] as const,
      ),
    ),
  );
  const pricePerMonth = (plan: { priceMonthly: number; currency: string }) =>
    t("subscription.perMonth", {
      price: (priceFormats.get(plan.currency) ?? f).money(plan.priceMonthly),
    });

  const current = now();
  const state = subscriptionState(pharmacy, current);
  const blocked = !hasAccess(pharmacy, current);
  const endsAt = pharmacy.subscriptionEndsAt;
  const daysLeft = endsAt ? daysLeftLabel(t, endsAt) : null;

  // Why access is paused; only shown when it is.
  const blockedReason =
    state === "suspended"
      ? t("subscription.reasonSuspended")
      : state === "cancelled"
        ? t("subscription.reasonCancelled")
        : state === "expired" && endsAt
          ? t("subscription.reasonExpired", { date: f.date(endsAt) })
          : null;

  return (
    <>
      <PageHeader title={t("subscription.title")} description={t("subscription.description")} />

      {blocked && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-5"
        >
          <Lock className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="font-semibold text-destructive">
              {t("subscription.accessBlockedTitle")}
            </p>
            {blockedReason && <p className="mt-1 text-sm font-medium">{blockedReason}</p>}
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subscription.accessBlockedBody")}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("subscription.currentPlan")}</CardTitle>
          </CardHeader>
          <CardContent>
            {currentPlan ? (
              <>
                <p className="text-2xl font-semibold">{currentPlan.name}</p>
                <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                  {pricePerMonth(currentPlan)}
                </p>
                {currentPlan.description && (
                  <p className="mt-3 text-sm text-muted-foreground">{currentPlan.description}</p>
                )}
              </>
            ) : (
              <p className="text-lg font-medium text-muted-foreground">
                {t("subscription.noPlan")}
              </p>
            )}

            <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-muted-foreground">{t("subscription.status")}</dt>
                <dd className="mt-1">
                  <SubscriptionBadge state={state} />
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t("subscription.validUntil")}</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2 font-medium">
                  <CalendarClock className="size-4 text-muted-foreground" />
                  {endsAt ? f.date(endsAt) : t("subscription.noEndDate")}
                  {daysLeft && <Badge tone="muted">{daysLeft}</Badge>}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t("subscription.branches")}</dt>
                <dd className="mt-1 flex items-center gap-2 font-medium tabular-nums">
                  <Store className="size-4 text-muted-foreground" />
                  {t("subscription.branchesUsed", {
                    used: f.number(branchesInUse),
                    limit: f.number(currentPlan?.maxBranches ?? 1),
                  })}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("subscription.howToRenewTitle")}</CardTitle>
            <LifeBuoy className="size-5 shrink-0 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t("subscription.howToRenewBody")}</p>
          </CardContent>
        </Card>
      </div>

      {activePlans.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold">{t("subscription.availablePlans")}</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            {t("subscription.availablePlansHint")}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activePlans.map((plan) => {
              const isCurrent = plan.id === pharmacy.planId;
              return (
                <Card key={plan.id} className={isCurrent ? "border-primary" : undefined}>
                  <CardContent>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{plan.name}</p>
                      {isCurrent && <Badge>{t("subscription.yourPlan")}</Badge>}
                    </div>
                    <Badge tone={plan.type === "multi_branch" ? "info" : "muted"} className="mt-1">
                      {t(PLAN_TYPE_LABEL[plan.type])}
                    </Badge>
                    <p className="mt-2 text-lg font-semibold tabular-nums">
                      {pricePerMonth(plan)}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Store className="size-4" />
                      {branchesIncluded(plan.maxBranches)}
                    </p>
                    {plan.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
