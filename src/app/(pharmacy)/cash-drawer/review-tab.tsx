import { and, count, desc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { CircleCheck, Receipt } from "lucide-react";
import Link from "next/link";
import { Badge, Card } from "@/components/ui/card";
import { cashDrawers, cashMovements, cashReviews, cashShifts, users } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { switchBranchHref } from "@/lib/active-branch";
import { daysFromNow } from "@/lib/time";
import { ForceCloseButton, ReviewDecision } from "./manager-forms";
import { categoryLabel, type Ctx } from "./shared";

// A session open this long was probably forgotten.
const STALE_HOURS = 16;
// Shortages: this many short closings by one person within PATTERN_DAYS.
const PATTERN_COUNT = 3;
const PATTERN_DAYS = 30;

const KIND_LABEL: Record<"variance" | "opening" | "payout", MessageKey> = {
  variance: "cashDrawer.reviewVariance",
  opening: "cashDrawer.reviewOpening",
  payout: "cashDrawer.reviewPayout",
};

function Section({ title, count: total, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <Card className="mb-4">
      <h2 className="flex items-center gap-2 border-b border-border px-5 py-3 font-semibold">
        {title}
        <span className="text-sm font-normal text-muted-foreground tabular-nums">({total})</span>
      </h2>
      {children}
    </Card>
  );
}

/**
 * The manager's queue, across every branch: counts and pay-outs waiting for a
 * decision, sessions somebody forgot to close, and people who are often short.
 */
export async function ReviewTab({ ctx }: { ctx: Ctx }) {
  const { db, pharmacy, branch, branches, t, f } = ctx;
  const [pending, stale, patterns] = await Promise.all([
    db
      .select({
        id: cashReviews.id,
        kind: cashReviews.kind,
        amount: cashReviews.amount,
        blocking: cashReviews.blocking,
        createdAt: cashReviews.createdAt,
        branchId: cashReviews.branchId,
        shiftId: cashReviews.shiftId,
        drawerName: cashDrawers.name,
        staffName: users.name,
        shiftNote: cashShifts.note,
        attempts: sql<number>`jsonb_array_length(${cashShifts.countAttempts})`.mapWith(Number),
        openingBalance: cashShifts.openingBalance,
        expectedOpening: cashShifts.expectedOpening,
        movementId: cashMovements.id,
        category: cashMovements.category,
        movementNote: cashMovements.reason,
        receiptPath: cashMovements.receiptPath,
      })
      .from(cashReviews)
      .innerJoin(cashShifts, eq(cashShifts.id, cashReviews.shiftId))
      .innerJoin(cashDrawers, eq(cashDrawers.id, cashReviews.drawerId))
      .leftJoin(users, eq(users.id, cashReviews.userId))
      .leftJoin(cashMovements, eq(cashMovements.id, cashReviews.movementId))
      .where(and(eq(cashReviews.pharmacyId, pharmacy.id), eq(cashReviews.status, "pending")))
      .orderBy(desc(cashReviews.blocking), desc(cashReviews.createdAt)),
    db
      .select({
        id: cashShifts.id,
        openedAt: cashShifts.openedAt,
        branchId: cashShifts.branchId,
        drawerName: cashDrawers.name,
        ownerName: users.name,
      })
      .from(cashShifts)
      .innerJoin(cashDrawers, eq(cashDrawers.id, cashShifts.drawerId))
      .leftJoin(users, eq(users.id, cashShifts.openedBy))
      .where(
        and(
          eq(cashShifts.pharmacyId, pharmacy.id),
          isNull(cashShifts.closedAt),
          lt(cashShifts.openedAt, daysFromNow(-STALE_HOURS / 24)),
        ),
      )
      .orderBy(cashShifts.openedAt),
    db
      .select({
        userId: cashShifts.openedBy,
        name: users.name,
        shorts: count(),
        total: sql<number>`sum(${cashShifts.difference})`.mapWith(Number),
      })
      .from(cashShifts)
      .leftJoin(users, eq(users.id, cashShifts.openedBy))
      .where(
        and(
          eq(cashShifts.pharmacyId, pharmacy.id),
          isNotNull(cashShifts.closedAt),
          gte(cashShifts.closedAt, daysFromNow(-PATTERN_DAYS)),
          lt(cashShifts.difference, 0),
        ),
      )
      .groupBy(cashShifts.openedBy, users.name)
      .having(gte(count(), PATTERN_COUNT))
      .orderBy(sql`sum(${cashShifts.difference})`),
  ]);

  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const showBranch = branches.length > 1;
  // A session of another branch opens after switching to it.
  const sessionHref = (branchId: string, shiftId: string) =>
    branchId === branch.id ? `/cash-drawer/${shiftId}` : switchBranchHref(branchId, `/cash-drawer/${shiftId}`);
  const signed = (value: number) => `${value > 0 ? "+" : ""}${f.money(value)}`;
  const where = (branchId: string, drawer: string) =>
    showBranch ? `${branchName.get(branchId) ?? "—"} · ${drawer}` : drawer;

  if (pending.length === 0 && stale.length === 0 && patterns.length === 0) {
    return (
      <Card className="flex flex-col items-center px-6 py-14 text-center">
        <CircleCheck className="size-10 text-success" />
        <p className="mt-3 font-medium">{t("cashDrawer.reviewEmpty")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("cashDrawer.reviewEmptyHint")}</p>
      </Card>
    );
  }

  return (
    <>
      {pending.length > 0 && (
        <Section title={t("cashDrawer.waitingForYou")} count={pending.length}>
          <ul className="divide-y divide-border">
            {pending.map((row) => {
              const tone = row.blocking ? "danger" : "warning";
              let detail: string;
              if (row.kind === "variance") {
                detail = [
                  row.attempts > 1 ? t("cashDrawer.recountedTimes", { count: row.attempts - 1 }) : null,
                  row.shiftNote ? t("cashDrawer.reasonQuoted", { reason: row.shiftNote }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
              } else if (row.kind === "opening") {
                detail = t("cashDrawer.openingDetail", {
                  counted: f.money(row.openingBalance),
                  left: f.money(row.expectedOpening),
                });
              } else {
                detail = [categoryLabel("out", row.category, t), row.movementNote].filter(Boolean).join(" · ");
              }
              return (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={tone}>
                        {t(KIND_LABEL[row.kind])}{" "}
                        {row.kind === "payout" ? f.money(row.amount) : signed(row.amount)}
                      </Badge>
                      {row.blocking && <Badge tone="danger">{t("cashDrawer.drawerBlockedBadge")}</Badge>}
                      <Link href={sessionHref(row.branchId, row.shiftId)} className="font-medium hover:text-primary hover:underline">
                        {row.staffName ?? "—"} · {where(row.branchId, row.drawerName)} · {f.dateTime(row.createdAt)}
                      </Link>
                    </div>
                    {detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}
                    {row.receiptPath && row.movementId && (
                      <a
                        href={`/cash-drawer/receipts/${row.movementId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        <Receipt className="size-4" />
                        {t("cashDrawer.viewReceipt")}
                      </a>
                    )}
                  </div>
                  <ReviewDecision reviewId={row.id} />
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {stale.length > 0 && (
        <Section title={t("cashDrawer.stillOpen")} count={stale.length}>
          <ul className="divide-y divide-border">
            {stale.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="danger">{t("cashDrawer.statusOpen")}</Badge>
                    <Link href={sessionHref(row.branchId, row.id)} className="font-medium hover:text-primary hover:underline">
                      {row.ownerName ?? "—"} · {where(row.branchId, row.drawerName)} ·{" "}
                      {t("cashDrawer.openedOn", { date: f.dateTime(row.openedAt) })}
                    </Link>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{t("cashDrawer.forgotToClose")}</p>
                </div>
                <ForceCloseButton shiftId={row.id} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {patterns.length > 0 && (
        <Section title={t("cashDrawer.patterns")} count={patterns.length}>
          <ul className="divide-y divide-border">
            {patterns.map((row) => (
              <li key={row.userId ?? "none"} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="danger">{t("cashDrawer.pattern")}</Badge>
                    <span className="font-medium">
                      {t("cashDrawer.patternTitle", {
                        name: row.name ?? "—",
                        count: row.shorts,
                        days: PATTERN_DAYS,
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("cashDrawer.patternTotal", { amount: f.money(row.total) })}
                  </p>
                </div>
                {row.userId && (
                  <Link
                    href={`/cash-drawer?tab=history&staff=${row.userId}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {t("cashDrawer.viewHistory")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
