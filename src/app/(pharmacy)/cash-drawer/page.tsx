import { and, count, eq, isNull } from "drizzle-orm";
import {
  Calculator,
  ClipboardCheck,
  History,
  Inbox,
  Lock,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { getDb } from "@/db";
import { cashReviews, cashShifts, type CashShift } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { canSwitchBranch, isManager } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import {
  getDrawerState,
  getPreviousShift,
  getShiftActivity,
  getShiftTotals,
  payoutCategories,
} from "@/lib/cash-drawer";
import { canRecount, cashRulesOf, varianceLevel } from "@/lib/cash-rules";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { now } from "@/lib/time";
import { cn, round2 } from "@/lib/utils";
import { requiredId } from "@/lib/validation";
import { CloseShiftPanel, type CountOutcome } from "./close-shift";
import { DrawersTab } from "./drawers-tab";
import { HistoryTab } from "./history-tab";
import { DrawerPicker, OpenShiftForm } from "./open-shift";
import { ReviewTab } from "./review-tab";
import { CashDropButton, NoSaleButton, PayInButton, PayOutButton } from "./session-actions";
import { ActivityList, drawerStaff, type Ctx } from "./shared";

export const generateMetadata = pageTitle("nav.cashDrawer");

const ACTIVITY_LIMIT = 100;

type Tab = "drawer" | "review" | "history" | "drawers";

function Tabs({ tab, isAdmin, pending, t }: { tab: Tab; isAdmin: boolean; pending: number; t: Ctx["t"] }) {
  const tabs: { key: Tab; label: MessageKey; icon: LucideIcon; badge?: number }[] = [
    { key: "drawer", label: "cashDrawer.tabDrawer", icon: Calculator },
  ];
  if (isAdmin) {
    tabs.push(
      { key: "review", label: "cashDrawer.tabReview", icon: ClipboardCheck, badge: pending },
      { key: "history", label: "cashDrawer.tabHistory", icon: History },
      { key: "drawers", label: "cashDrawer.tabDrawers", icon: Inbox },
    );
  }
  return (
    <nav className="mb-6 flex flex-wrap gap-1 rounded-xl bg-muted p-1 sm:inline-flex" aria-label={t("nav.cashDrawer")}>
      {tabs.map(({ key, label, icon: Icon, badge }) => (
        <Link
          key={key}
          href={key === "drawer" ? "/cash-drawer" : `/cash-drawer?tab=${key}`}
          aria-current={tab === key ? "page" : undefined}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors sm:flex-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            tab === key ? "bg-card text-primary shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {t(label)}
          {badge ? (
            <span className="rounded-full bg-warning px-1.5 text-xs font-semibold text-warning-foreground tabular-nums">
              {badge}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

export default async function CashDrawerPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    page?: string;
    close?: string;
    handover?: string;
    month?: string;
    drawer?: string;
    staff?: string;
  }>;
}) {
  const { user, pharmacy, branch, branches } = await requirePharmacy();
  const [t, f, db, params] = await Promise.all([getT(), getFormat(pharmacy), getDb(), searchParams]);
  // Managers (and admins) get the review, history and drawer tabs.
  const isAdmin = isManager(user);
  const tab: Tab =
    params.tab === "review" || params.tab === "history" || params.tab === "drawers"
      ? params.tab
      : "drawer";
  if (tab !== "drawer" && !isAdmin) notFound();
  const ctx: Ctx = { user, pharmacy, branch, branches, t, f, db };

  const [{ pending }] = isAdmin
    ? await db
        .select({ pending: count() })
        .from(cashReviews)
        .where(
          and(
            eq(cashReviews.pharmacyId, pharmacy.id),
            canSwitchBranch(user) ? undefined : eq(cashReviews.branchId, branch.id),
            eq(cashReviews.status, "pending"),
          ),
        )
    : [{ pending: 0 }];

  return (
    <>
      <PageHeader title={t("nav.cashDrawer")} description={t("cashDrawer.description")} />
      <Tabs tab={tab} isAdmin={isAdmin} pending={pending} t={t} />
      {tab === "drawer" && <DrawerTab ctx={ctx} close={params.close === "1"} handover={params.handover} />}
      {tab === "review" && <ReviewTab ctx={ctx} />}
      {tab === "history" && <HistoryTab ctx={ctx} params={params} />}
      {tab === "drawers" && <DrawersTab ctx={ctx} />}
    </>
  );
}

async function DrawerTab({ ctx, close, handover }: { ctx: Ctx; close: boolean; handover?: string }) {
  const { db, branch, pharmacy, user, t, f } = ctx;
  const isAdmin = isManager(user);
  const state = await getDrawerState(db, branch, t("cashDrawer.defaultDrawerName"));
  if (!state.drawer) {
    return (
      <EmptyState icon={Inbox} title={t("cashDrawer.noDrawers")} hint={t("cashDrawer.noDrawersHint")}>
        {isAdmin && (
          <Link href="/cash-drawer?tab=drawers" className={buttonClass()}>
            {t("cashDrawer.tabDrawers")}
          </Link>
        )}
      </EmptyState>
    );
  }
  const drawer = state.drawer;

  const [staff, openDrawerIds] = await Promise.all([
    drawerStaff(ctx),
    db
      .select({ drawerId: cashShifts.drawerId })
      .from(cashShifts)
      .where(
        and(
          eq(cashShifts.pharmacyId, pharmacy.id),
          eq(cashShifts.branchId, branch.id),
          isNull(cashShifts.closedAt),
        ),
      )
      .then((rows) => new Set(rows.map((r) => r.drawerId))),
  ]);
  const picker = (
    <DrawerPicker
      drawers={state.drawers.map((d) => ({ id: d.id, name: d.name, open: openDrawerIds.has(d.id) }))}
      current={drawer.id}
    />
  );

  if (!state.shift) {
    if (state.blocked) {
      return (
        <>
          <div className="mb-4">{picker}</div>
          <Card className="flex max-w-xl gap-4 p-6">
            <ShieldAlert className="size-8 shrink-0 text-destructive" />
            <div>
              <h2 className="text-lg font-semibold">{t("cashDrawer.blockedTitle", { drawer: drawer.name })}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("cashDrawer.blockedHint")}</p>
              {isAdmin && (
                <Link href="/cash-drawer?tab=review" className={buttonClass({ className: "mt-4" })}>
                  {t("cashDrawer.tabReview")}
                </Link>
              )}
            </div>
          </Card>
        </>
      );
    }

    const previous = await getPreviousShift(db, drawer);
    // A handover: the session that just closed on this drawer.
    let handoverFrom: string | null = null;
    if (handover && requiredId.safeParse(handover).success && previous?.id === handover) {
      handoverFrom = previous.closedByName ?? "—";
    }
    return (
      <>
        <div className="mb-4">{picker}</div>
        <OpenShiftForm
          drawer={{ id: drawer.id, name: drawer.name }}
          staff={staff}
          defaultUserId={handoverFrom ? undefined : user.id}
          previous={
            previous?.closedAt
              ? {
                  closedBy: previous.closedByName,
                  closedAt: f.dateTime(previous.closedAt),
                  review: previous.reviewStatus,
                }
              : null
          }
          handoverFrom={handoverFrom}
        />
      </>
    );
  }

  const shift = state.shift;
  if (close || shift.countAttempts.length > 0) {
    return (
      <CloseShiftPanel
        shiftId={shift.id}
        staff={staff}
        ownerId={shift.openedBy}
        initial={await lastCount(ctx, shift)}
      />
    );
  }

  const activity = await getShiftActivity(db, shift, ACTIVITY_LIMIT);
  const managers = staff.filter((s) => s.role !== "staff");
  const categories = await payoutCategories(db, pharmacy.id, [
        t("cashDrawer.payOut_supplies"),
        t("cashDrawer.payOut_transport"),
        t("cashDrawer.payOut_cleaning"),
        t("cashDrawer.payOut_other"),
      ]);
  const minutes = Math.max(0, Math.floor((now().getTime() - shift.openedAt.getTime()) / 60_000));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">{picker}</div>
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge tone="success">● {t("cashDrawer.sessionOpen")}</Badge>
          <span className="font-semibold">{state.ownerName ?? "—"}</span>
          <span className="text-sm text-muted-foreground">
            {drawer.name} ·{" "}
            {t("cashDrawer.since", {
              time: f.time(shift.openedAt),
              hours: Math.floor(minutes / 60),
              minutes: minutes % 60,
            })}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <PayInButton shiftId={shift.id} />
          <PayOutButton
            shiftId={shift.id}
            approvalLimit={pharmacy.payoutApprovalLimit}
            managers={managers}
            categories={categories}
          />
          <CashDropButton shiftId={shift.id} />
          <NoSaleButton shiftId={shift.id} />
          <Link
            href="/cash-drawer?close=1"
            className={buttonClass({ className: "bg-warning text-warning-foreground hover:bg-warning/90" })}
          >
            <Lock />
            {t("cashDrawer.closeShift")}
          </Link>
        </div>
      </Card>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("cashDrawer.expectedHidden")}
        {isAdmin && (
          <>
            {" "}
            <Link href={`/cash-drawer/${shift.id}`} className="font-medium text-primary hover:underline">
              {t("cashDrawer.managerView")}
            </Link>
          </>
        )}
      </p>

      <Card className="mt-4">
        <h2 className="border-b border-border px-6 py-4 text-lg font-semibold">{t("cashDrawer.activity")}</h2>
        <ActivityList rows={activity} t={t} f={f} />
      </Card>
    </>
  );
}

/** The result of the session's last count, to resume closing after a reload. */
async function lastCount(ctx: Ctx, shift: CashShift): Promise<CountOutcome | null> {
  const last = shift.countAttempts.at(-1);
  if (!last) return null;
  const rules = cashRulesOf(ctx.pharmacy);
  const totals = await getShiftTotals(ctx.db, shift);
  const difference = round2(last.total - totals.expectedCash);
  return {
    ok: true,
    counted: last.total,
    expected: totals.expectedCash,
    difference,
    level: varianceLevel(difference, rules),
    canRecount: canRecount(difference, shift.countAttempts.length, rules),
    recountsLeft: Math.max(0, rules.recounts - (shift.countAttempts.length - 1)),
    openingBalance: shift.openingBalance,
    totals,
  };
}

