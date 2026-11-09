import { and, asc, count, eq, exists, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { Ban, Building2, CalendarX, CircleCheck, Plus } from "lucide-react";
import Link from "next/link";
import {
  STATE_LABEL,
  SUBSCRIPTION_STATES,
  subscriptionState,
} from "@/lib/subscription";
import { SubscriptionBadge } from "@/components/subscription-badge";
import { buttonClass } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { FilterSelect, Pagination, SearchInput } from "@/components/ui/list-controls";
import { EmptyState, PageHeader, Toolbar } from "@/components/ui/page";
import { STICKY_END_TD, STICKY_END_TH, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { cn } from "@/lib/utils";
import { pharmacies, plans, users } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requireSuperAdmin } from "@/lib/auth";
import { getFormat } from "@/lib/format-server";
import { todayInTimezone } from "@/lib/dates";
import { pageTitle } from "@/lib/metadata";
import { stripeStatus } from "@/lib/platform";
import { PAGE_SIZE, likePattern, pageCountOf, parsePage } from "@/lib/pagination";
import { now } from "@/lib/time";
import { EndDate } from "../_components/end-date";
import { accessCondition, stateCondition } from "../_lib/conditions";
import { formatsByZone } from "../_lib/format";
import { planPrices } from "../_lib/plan-prices";
import { PharmacyRowActions } from "./row-actions";

export const generateMetadata = pageTitle("platform.pharmaciesTitle");

type Param = string | string[] | undefined;

/** A query parameter can repeat (?q=a&q=b); the first value wins. */
function single(value: Param): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PharmaciesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: Param; status?: Param; plan?: Param; page?: Param }>;
}) {
  await requireSuperAdmin();
  const [t, f, db, params] = await Promise.all([getT(), getFormat(), getDb(), searchParams]);

  const q = single(params.q)?.trim();
  const status = single(params.status);
  const state = SUBSCRIPTION_STATES.find((s) => s === status);
  const page = parsePage(single(params.page));
  const current = now();

  // Plans for the plan filter; "none" = pharmacies without a plan.
  const planList = await db
    .select({
      id: plans.id,
      name: plans.name,
      isActive: plans.isActive,
      priceMonthly: plans.priceMonthly,
      priceYearly: plans.priceYearly,
      currency: plans.currency,
    })
    .from(plans)
    .orderBy(asc(plans.sortOrder), asc(plans.name));
  const planParam = single(params.plan);
  const planFilter =
    planParam === "none" ? "none" : planList.find((p) => p.id === planParam)?.id;

  const pattern = q ? likePattern(q) : null;
  const where = and(
    state ? stateCondition(state, current) : undefined,
    planFilter === "none"
      ? isNull(pharmacies.planId)
      : planFilter
        ? eq(pharmacies.planId, planFilter)
        : undefined,
    pattern
      ? or(
          ilike(pharmacies.name, pattern),
          ilike(pharmacies.email, pattern),
          exists(
            db
              .select({ one: sql`1` })
              .from(users)
              .where(and(eq(users.pharmacyId, pharmacies.id), ilike(users.email, pattern))),
          ),
        )
      : undefined,
  );

  const [[{ total }], rows, allCount, activeCount, expiredCount, suspendedCount] = await Promise.all([
    db.select({ total: count() }).from(pharmacies).where(where),
    db
      .select({
        id: pharmacies.id,
        name: pharmacies.name,
        email: pharmacies.email,
        planId: pharmacies.planId,
        status: pharmacies.status,
        subscriptionStatus: pharmacies.subscriptionStatus,
        subscriptionEndsAt: pharmacies.subscriptionEndsAt,
        currency: pharmacies.currency,
        timezone: pharmacies.timezone,
        createdAt: pharmacies.createdAt,
        planName: plans.name,
      })
      .from(pharmacies)
      .leftJoin(plans, eq(pharmacies.planId, plans.id))
      .where(where)
      .orderBy(asc(pharmacies.name), asc(pharmacies.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    // Platform-wide counts for the cards; they ignore the filters below them.
    db.$count(pharmacies),
    db.$count(pharmacies, accessCondition(current)),
    db.$count(pharmacies, stateCondition("expired", current)),
    db.$count(pharmacies, stateCondition("suspended", current)),
  ]);

  // Admin emails for the pharmacies on this page only.
  const adminRows =
    rows.length > 0
      ? await db
          .select({ pharmacyId: users.pharmacyId, email: users.email })
          .from(users)
          .where(
            and(
              inArray(
                users.pharmacyId,
                rows.map((row) => row.id),
              ),
              eq(users.role, "admin"),
            ),
          )
          .orderBy(asc(users.createdAt))
      : [];
  const adminEmails = new Map<string, string[]>();
  for (const admin of adminRows) {
    if (!admin.pharmacyId) continue;
    adminEmails.set(admin.pharmacyId, [...(adminEmails.get(admin.pharmacyId) ?? []), admin.email]);
  }

  const zoneFormats = await formatsByZone(rows);
  const prices = await planPrices(planList, t);
  const stripeConfigured = stripeStatus().configured;
  // "Nothing found" rather than "no pharmacies yet" whenever some exist: a
  // search or filter matched none, or the page number is past the last page.
  const filtered = Boolean(q || state || planFilter) || total > 0;

  return (
    <>
      <PageHeader
        title={t("platform.pharmaciesTitle")}
        description={t("platform.pharmaciesDescription")}
      >
        <Link href="/superadmin/pharmacies/new" className={buttonClass()}>
          <Plus />
          {t("platform.addPharmacy")}
        </Link>
      </PageHeader>

      <div className="mb-6 grid gap-4 *:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("platform.statTotal")} value={f.number(allCount)} icon={Building2} />
        <StatCard
          label={t("platform.statActive")}
          value={f.number(activeCount)}
          hint={t("platform.statActiveHint")}
          icon={CircleCheck}
          tone="success"
        />
        <StatCard
          label={t("platform.statExpired")}
          value={f.number(expiredCount)}
          hint={t("platform.statExpiredHint")}
          icon={CalendarX}
          tone={expiredCount > 0 ? "warning" : "default"}
        />
        <StatCard
          label={t("platform.statSuspended")}
          value={f.number(suspendedCount)}
          hint={t("platform.statSuspendedHint")}
          icon={Ban}
          tone={suspendedCount > 0 ? "danger" : "default"}
        />
      </div>

      <Toolbar>
        <SearchInput placeholder={t("platform.searchPharmacies")} />
        <FilterSelect
          param="status"
          aria-label={t("platform.filterStatus")}
          options={[
            { value: "", label: t("billing.allStatuses") },
            ...SUBSCRIPTION_STATES.map((s) => ({ value: s, label: t(STATE_LABEL[s]) })),
          ]}
        />
        <FilterSelect
          param="plan"
          aria-label={t("platform.filterPlan")}
          options={[
            { value: "", label: t("platform.allPlans") },
            ...planList.map((p) => ({ value: p.id, label: p.name })),
            { value: "none", label: t("platform.noPlanFilter") },
          ]}
        />
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={filtered ? t("common.noResults") : t("platform.pharmaciesEmpty")}
          hint={filtered ? t("common.noResultsHint") : t("platform.pharmaciesEmptyHint")}
        />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("platform.colPharmacy")}</TH>
                <TH>{t("platform.colAdmins")}</TH>
                <TH>{t("platform.colPlan")}</TH>
                <TH>{t("platform.colSubscription")}</TH>
                <TH>{t("platform.colValidUntil")}</TH>
                <TH>{t("platform.colCreated")}</TH>
                <TH className={cn("text-right", STICKY_END_TH)}>{t("common.actions")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => {
                const admins = adminEmails.get(row.id) ?? [];
                return (
                  <TR key={row.id}>
                    <TD>
                      <Link
                        href={`/superadmin/pharmacies/${row.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {row.name}
                      </Link>
                      {row.email && (
                        <p className="text-xs text-muted-foreground">{row.email}</p>
                      )}
                    </TD>
                    <TD>
                      {admins.length === 0 ? (
                        <span className="text-muted-foreground">{t("platform.noAdmin")}</span>
                      ) : (
                        admins.map((email) => <p key={email}>{email}</p>)
                      )}
                    </TD>
                    <TD>{row.planName ?? "—"}</TD>
                    <TD>
                      <SubscriptionBadge state={subscriptionState(row, current)} />
                    </TD>
                    <TD>
                      <EndDate
                        endsAt={row.subscriptionEndsAt}
                        format={zoneFormats.get(row.timezone) ?? f}
                      />
                    </TD>
                    <TD className="whitespace-nowrap tabular-nums">{f.date(row.createdAt)}</TD>
                    <TD className={STICKY_END_TD}>
                      <div className="flex justify-end">
                        <PharmacyRowActions
                          pharmacy={{
                            id: row.id,
                            name: row.name,
                            planId: row.planId,
                            suspended: row.status !== "active",
                          }}
                          plans={prices}
                          today={todayInTimezone(row.timezone)}
                          stripeConfigured={stripeConfigured}
                        />
                      </div>
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
