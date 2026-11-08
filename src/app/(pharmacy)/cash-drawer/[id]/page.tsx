import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ArrowLeft, CircleCheck, UserRoundPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { getDb } from "@/db";
import { cashDrawers, cashReviews, cashShifts, users, type CashCounts } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { canSwitchBranch } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { branchScope, inScope } from "@/lib/branches";
import { denominationsFor } from "@/lib/cash-counts";
import { getShiftActivity, getShiftTotals } from "@/lib/cash-drawer";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { requiredId } from "@/lib/validation";
import { PrintButton } from "../../sales/[id]/print-button";
import { ActivityList } from "../shared";

export const generateMetadata = pageTitle("cashDrawer.sessionTitle");

const PRINT_PAGE_CSS = "@page { margin: 6mm 4mm; }";
const PRINT_COLOURS =
  "print:[--card:#fff] print:[--card-foreground:#000] print:[--foreground:#000] " +
  "print:[--muted-foreground:#000] print:[--border:#000]";
const DIVIDER = "my-2 border-t border-dashed border-border";

const REVIEW_TONE = { pending: "warning", approved: "success", rejected: "danger" } as const;
const REVIEW_KIND: Record<string, MessageKey> = {
  variance: "cashDrawer.reviewVariance",
  opening: "cashDrawer.reviewOpening",
  payout: "cashDrawer.reviewPayout",
};

/** Label / value lines of the Z-slip. */
function Lines({ rows, bold }: { rows: [string, string][]; bold?: boolean }) {
  return (
    <dl className="space-y-0.5">
      {rows.map(([label, value]) => (
        <div key={label} className={`flex justify-between gap-3 ${bold ? "font-semibold" : ""}`}>
          <dt>{label}</dt>
          <dd className="text-right tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One cash drawer session: its Z-slip (printable on the receipt printer),
 * how the drawer was counted, reviews and every cash movement. Open sessions
 * are for managers only, so the expected amount stays hidden from cashiers.
 */
export default async function CashSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ closed?: string }>;
}) {
  const { user, pharmacy, branch } = await requirePharmacy();
  const { id } = await params;
  if (!requiredId.safeParse(id).success) notFound();
  const { closed } = await searchParams;
  const [t, f, db] = await Promise.all([getT(), getFormat(pharmacy), getDb()]);

  const opener = alias(users, "opener");
  const closer = alias(users, "closer");
  const [row] = await db
    .select({
      shift: cashShifts,
      drawerName: cashDrawers.name,
      openerName: opener.name,
      closerName: closer.name,
    })
    .from(cashShifts)
    .innerJoin(cashDrawers, eq(cashDrawers.id, cashShifts.drawerId))
    .leftJoin(opener, eq(opener.id, cashShifts.openedBy))
    .leftJoin(closer, eq(closer.id, cashShifts.closedBy))
    .where(and(eq(cashShifts.id, id), inScope(cashShifts, branchScope(branch))))
    .limit(1);
  if (!row) notFound();
  const { shift } = row;
  const isAdmin = canSwitchBranch(user);
  const own = shift.openedBy === user.id || shift.closedBy === user.id;
  if (!isAdmin && (!own || !shift.closedAt)) notFound();

  const [live, activity, reviews] = await Promise.all([
    getShiftTotals(db, shift),
    getShiftActivity(db, shift, 200),
    db
      .select({
        id: cashReviews.id,
        kind: cashReviews.kind,
        amount: cashReviews.amount,
        status: cashReviews.status,
        reviewNote: cashReviews.reviewNote,
        reviewedAt: cashReviews.reviewedAt,
        reviewer: users.name,
      })
      .from(cashReviews)
      .leftJoin(users, eq(users.id, cashReviews.reviewedBy))
      .where(and(eq(cashReviews.shiftId, shift.id), eq(cashReviews.pharmacyId, pharmacy.id)))
      .orderBy(desc(cashReviews.createdAt)),
  ]);

  // A closed session shows what was recorded when it closed; older sessions
  // had no card and transfer totals, so those come from their sales.
  const isClosed = shift.closedAt !== null;
  const totals = {
    cashSales: shift.cashSales ?? live.cashSales,
    cashRefunds: shift.cashRefunds ?? live.cashRefunds,
    payIns: shift.payIns ?? live.payIns,
    payOuts: (shift.payOuts ?? live.payOuts) + (shift.expenses ?? live.expenses),
    drops: shift.drops ?? live.drops,
    cardSales: shift.cardSales ?? live.cardSales,
    transferSales: shift.transferSales ?? live.transferSales,
    salesCount: shift.salesCount ?? live.salesCount,
    expected: shift.expectedCash ?? live.expectedCash,
  };
  const signed = (value: number) => `${value > 0 ? "+" : ""}${f.money(value)}`;
  const minus = (value: number) => (value > 0 ? `−${f.money(value)}` : f.money(0));
  const sameName = branch.name.trim().toLowerCase() === pharmacy.name.trim().toLowerCase();

  const header: [string, string][] = [
    [t("cashDrawer.drawer"), row.drawerName],
    [t("cashDrawer.staff"), row.openerName ?? "—"],
    [t("cashDrawer.zOpen"), f.dateTime(shift.openedAt)],
    [t("cashDrawer.zClose"), isClosed ? f.dateTime(shift.closedAt) : t("cashDrawer.statusOpen")],
    [t("cashDrawer.salesCount"), f.number(totals.salesCount)],
  ];
  if (row.closerName && row.closerName !== row.openerName) {
    header.splice(2, 0, [t("cashDrawer.closedByLabel"), row.closerName]);
  }
  const cash: [string, string][] = [
    [t("cashDrawer.openingFloat"), f.money(shift.openingBalance)],
    [t("cashDrawer.cashSales"), f.money(totals.cashSales)],
    [t("cashDrawer.cashRefunds"), minus(totals.cashRefunds)],
    [t("cashDrawer.payIns"), f.money(totals.payIns)],
    [t("cashDrawer.payOuts"), minus(totals.payOuts)],
    [t("cashDrawer.drops"), minus(totals.drops)],
  ];
  const result: [string, string][] = [[t("cashDrawer.expected"), f.money(totals.expected)]];
  if (isClosed) {
    result.push(
      [t("cashDrawer.counted"), f.money(shift.countedCash)],
      [t("cashDrawer.difference"), signed(shift.difference ?? 0)],
    );
  }
  const other: [string, string][] = [
    [t("sales.card"), f.money(totals.cardSales)],
    [t("sales.transfer"), f.money(totals.transferSales)],
  ];
  const safe: [string, string][] = [];
  if (isClosed && shift.closingDrop !== null) {
    safe.push(
      [
        shift.closingBag ? t("cashDrawer.toSafeBag", { bag: shift.closingBag }) : t("cashDrawer.toSafe"),
        f.money(shift.closingDrop),
      ],
      [t("cashDrawer.leftInDrawer"), f.money(shift.leftInDrawer)],
    );
  }
  const denominations = denominationsFor(pharmacy.currency);
  const counts: CashCounts | null = shift.closingCounts ?? null;

  return (
    <>
      <style>{PRINT_PAGE_CSS}</style>
      <PageHeader
        title={t("cashDrawer.sessionTitle")}
        description={`${row.drawerName} · ${f.dateTime(shift.openedAt)}`}
      >
        <Link
          href={isAdmin ? "/cash-drawer?tab=history" : "/cash-drawer"}
          className={buttonClass({ variant: "ghost" })}
        >
          <ArrowLeft />
          {t("common.back")}
        </Link>
        {isClosed && <PrintButton auto={closed === "1"} />}
      </PageHeader>

      {closed === "1" && isClosed && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 p-4 print:hidden">
          <p className="flex items-center gap-2 font-medium text-success">
            <CircleCheck className="size-5" />
            {t("cashDrawer.sessionClosed")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/cash-drawer?handover=${shift.id}`} className={buttonClass({ variant: "outline" })}>
              <UserRoundPlus />
              {t("cashDrawer.handOver")}
            </Link>
            <Link href="/pos" className={buttonClass()}>
              {t("cashDrawer.done")}
            </Link>
          </div>
        </Card>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <article
          className={`mx-auto w-full max-w-sm rounded-xl border border-border bg-card p-5 font-mono text-[13px] leading-snug text-card-foreground shadow-xs print:max-w-[80mm] print:rounded-none print:border-0 print:p-0 print:text-xs print:shadow-none ${PRINT_COLOURS}`}
        >
          <header className="text-center">
            <p className="font-semibold">{pharmacy.name}</p>
            {!sameName && <p>{branch.name}</p>}
            <p className="mt-1 font-semibold tracking-wide uppercase">{t("cashDrawer.zSlip")}</p>
          </header>
          <div className={DIVIDER} />
          <Lines rows={header} />
          <div className={DIVIDER} />
          <Lines rows={cash} />
          <div className={DIVIDER} />
          <Lines rows={result} bold />
          {safe.length > 0 && (
            <>
              <div className={DIVIDER} />
              <Lines rows={safe} />
            </>
          )}
          <div className={DIVIDER} />
          <Lines rows={other} />
          {shift.note && (
            <>
              <div className={DIVIDER} />
              <p>
                {t("cashDrawer.reason")}: {shift.note}
              </p>
            </>
          )}
          <p className="mt-6">{t("cashDrawer.signature")} ______________________</p>
        </article>

        <div className="grid min-w-0 gap-4 print:hidden">
          {reviews.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">{t("cashDrawer.reviews")}</h2>
              <ul className="grid gap-3">
                {reviews.map((r) => (
                  <li key={r.id} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={REVIEW_TONE[r.status]}>{t(`cashDrawer.review_${r.status}`)}</Badge>
                      <span className="font-medium">
                        {t(REVIEW_KIND[r.kind])} {r.kind === "payout" ? f.money(r.amount) : signed(r.amount)}
                      </span>
                    </div>
                    {r.reviewer && (
                      <p className="mt-1 text-muted-foreground">
                        {t("cashDrawer.decidedBy", { name: r.reviewer, date: f.dateTime(r.reviewedAt) })}
                        {r.reviewNote && ` · ${r.reviewNote}`}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {denominations && counts && (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">{t("cashDrawer.closingCount")}</h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                {denominations.map((d) => (
                  <div key={d.value} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground tabular-nums">
                      {f.number(d.value)} × {f.number(counts[String(d.value)] ?? 0)}
                    </dt>
                    <dd className="tabular-nums">{f.number(d.value * (counts[String(d.value)] ?? 0))}</dd>
                  </div>
                ))}
              </dl>
              {shift.countAttempts.length > 1 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {t("cashDrawer.earlierCounts", {
                    amounts: shift.countAttempts
                      .slice(0, -1)
                      .map((a) => f.money(a.total))
                      .join(", "),
                  })}
                </p>
              )}
            </Card>
          )}

          {shift.expectedOpening !== null && shift.expectedOpening !== shift.openingBalance && (
            <Card className="p-5 text-sm">
              {t("cashDrawer.openingDetail", {
                counted: f.money(shift.openingBalance),
                left: f.money(shift.expectedOpening),
              })}
            </Card>
          )}

          <Card>
            <h2 className="border-b border-border px-6 py-4 font-semibold">{t("cashDrawer.activity")}</h2>
            <ActivityList rows={activity} t={t} f={f} />
          </Card>
        </div>
      </div>
    </>
  );
}
