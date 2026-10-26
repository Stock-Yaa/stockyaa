import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Calculator, History, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/ui/list-controls";
import { PageHeader } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { cashShifts, users, type Branch } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { branchScope, inScope } from "@/lib/branches";
import { getOpenShift, getShiftActivity, getShiftTotals, type ShiftActivity } from "@/lib/cash-drawer";
import type { Format } from "@/lib/format";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { PAGE_SIZE, pageCountOf, parsePage } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { CashMovementButton, CloseDrawerButton, OpenDrawerForm } from "./drawer-forms";

export const generateMetadata = pageTitle("nav.cashDrawer");

const ACTIVITY_LIMIT = 100;

const ACTIVITY_LABEL: Record<ShiftActivity["kind"], MessageKey> = {
  sale: "cashDrawer.kindSale",
  refund: "cashDrawer.kindRefund",
  in: "cashDrawer.kindIn",
  out: "cashDrawer.kindOut",
  expense: "cashDrawer.kindExpense",
};

const ACTIVITY_TONE: Record<ShiftActivity["kind"], string> = {
  sale: "bg-success/15 text-success",
  refund: "bg-destructive/15 text-destructive",
  in: "bg-success/15 text-success",
  out: "bg-warning/15 text-warning",
  expense: "bg-destructive/15 text-destructive",
};

function Tabs({ tab, t }: { tab: "current" | "history"; t: Awaited<ReturnType<typeof getT>> }) {
  const tabs: { key: "current" | "history"; href: string; label: MessageKey; icon: LucideIcon }[] = [
    { key: "current", href: "/cash-drawer", label: "cashDrawer.tabCurrent", icon: Calculator },
    { key: "history", href: "/cash-drawer?tab=history", label: "cashDrawer.tabHistory", icon: History },
  ];
  return (
    <nav className="mb-6 inline-flex rounded-xl bg-muted p-1" aria-label={t("nav.cashDrawer")}>
      {tabs.map(({ key, href, label, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={tab === key ? "page" : undefined}
          className={cn(
            "flex min-w-32 items-center justify-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-colors",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            tab === key
              ? "bg-card text-primary shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {t(label)}
        </Link>
      ))}
    </nav>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <Card className="min-w-0 p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 truncate text-2xl font-semibold tabular-nums", className)}>{value}</p>
    </Card>
  );
}

/** Over/short as a signed amount: green when it balances, blue over, red short. */
function Difference({ value, f }: { value: number | null; f: Format }) {
  if (value === null) return <>—</>;
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        value === 0 && "text-success",
        value > 0 && "text-info",
        value < 0 && "text-destructive",
      )}
    >
      {value > 0 ? "+" : ""}
      {f.money(value)}
    </span>
  );
}

export default async function CashDrawerPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const { pharmacy, branch } = await requirePharmacy();
  const [t, f, db, params] = await Promise.all([
    getT(),
    getFormat(pharmacy),
    getDb(),
    searchParams,
  ]);
  const tab = params.tab === "history" ? "history" : "current";

  return (
    <>
      <PageHeader title={t("nav.cashDrawer")} />
      <Tabs tab={tab} t={t} />
      {tab === "current" ? (
        <CurrentShift branch={branch} t={t} f={f} db={db} />
      ) : (
        <ShiftHistory branch={branch} page={parsePage(params.page)} t={t} f={f} db={db} />
      )}
    </>
  );
}

type Ctx = {
  /** Each branch has its own drawer; the page shows the current branch's. */
  branch: Branch;
  t: Awaited<ReturnType<typeof getT>>;
  f: Format;
  db: Awaited<ReturnType<typeof getDb>>;
};

async function CurrentShift({ branch, t, f, db }: Ctx) {
  const shift = await getOpenShift(db, branch);
  if (!shift) return <OpenDrawerForm />;

  const [totals, activity, [opener]] = await Promise.all([
    getShiftTotals(db, shift),
    getShiftActivity(db, shift, ACTIVITY_LIMIT),
    shift.openedBy
      ? db.select({ name: users.name }).from(users).where(eq(users.id, shift.openedBy))
      : Promise.resolve([]),
  ]);
  const transactions = totals.cashSalesCount + totals.cashRefundsCount + totals.movementsCount;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("cashDrawer.openingBalance")} value={f.money(shift.openingBalance)} />
        <Stat
          label={t("cashDrawer.currentBalance")}
          value={f.money(totals.expectedCash)}
          className="text-primary"
        />
        <Stat label={t("cashDrawer.transactions")} value={f.number(transactions)} />
        <Card className="min-w-0 p-5">
          <p className="text-sm text-muted-foreground">{t("cashDrawer.openedAt")}</p>
          <p className="mt-2 font-medium tabular-nums">{f.dateTime(shift.openedAt)}</p>
          {opener && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {t("cashDrawer.openedBy", { name: opener.name })}
            </p>
          )}
        </Card>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        {(
          [
            ["cashDrawer.cashSales", totals.cashSales],
            ["cashDrawer.cashRefunds", -totals.cashRefunds],
            ["cashDrawer.payIns", totals.payIns],
            ["cashDrawer.payOuts", -totals.payOuts],
            ["cashDrawer.expenses", -totals.expenses],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex gap-1.5">
            <dt>{t(label)}:</dt>
            <dd className="font-medium text-foreground tabular-nums">{f.money(value)}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <CashMovementButton type="in" />
        <CashMovementButton type="out" />
        <CashMovementButton type="expense" />
        <div className="ml-auto">
          <CloseDrawerButton shiftId={shift.id} expectedCash={totals.expectedCash} />
        </div>
      </div>

      <Card className="mt-4">
        <h2 className="border-b border-border px-6 py-4 text-lg font-semibold">
          {t("cashDrawer.transactions")}
        </h2>
        {activity.length === 0 ? (
          <p className="px-6 py-14 text-center text-muted-foreground">
            {t("cashDrawer.transactionsEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {activity.map((row) => (
              <li key={row.key} className="flex items-center gap-4 px-6 py-3">
                <span
                  className={cn(
                    "w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium",
                    ACTIVITY_TONE[row.kind],
                  )}
                >
                  {t(ACTIVITY_LABEL[row.kind])}
                </span>
                <div className="min-w-0 flex-1">
                  {row.saleId ? (
                    <Link
                      href={`/sales/${row.saleId}`}
                      className="text-sm font-medium hover:text-primary hover:underline"
                    >
                      {row.label}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-medium">{row.label}</p>
                  )}
                  <p className="truncate text-xs text-muted-foreground">
                    {f.dateTime(row.at)}
                    {row.userName && ` · ${row.userName}`}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    row.amount >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {row.amount >= 0 ? "+" : "−"}
                  {f.money(Math.abs(row.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

async function ShiftHistory({ branch, page, t, f, db }: Ctx & { page: number }) {
  const opener = alias(users, "opener");
  const closer = alias(users, "closer");
  const where = and(inScope(cashShifts, branchScope(branch)), isNotNull(cashShifts.closedAt));

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(cashShifts).where(where),
    db
      .select({
        id: cashShifts.id,
        openedAt: cashShifts.openedAt,
        closedAt: cashShifts.closedAt,
        openingBalance: cashShifts.openingBalance,
        countedCash: cashShifts.countedCash,
        expectedCash: cashShifts.expectedCash,
        difference: cashShifts.difference,
        note: cashShifts.note,
        openedBy: opener.name,
        closedBy: closer.name,
      })
      .from(cashShifts)
      .leftJoin(opener, eq(opener.id, cashShifts.openedBy))
      .leftJoin(closer, eq(closer.id, cashShifts.closedBy))
      .where(where)
      .orderBy(desc(cashShifts.openedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  return (
    <>
      <h2 className="mb-3 text-lg font-semibold">{t("cashDrawer.historyTitle")}</h2>
      {rows.length === 0 ? (
        <Card className="px-6 py-14 text-center text-muted-foreground">
          {t("cashDrawer.historyEmpty")}
        </Card>
      ) : (
        <Table>
          <THead>
            <tr className="uppercase">
              <TH>{t("cashDrawer.colOpened")}</TH>
              <TH>{t("cashDrawer.colClosed")}</TH>
              <TH>{t("cashDrawer.colCashier")}</TH>
              <TH className="text-right">{t("cashDrawer.colOpening")}</TH>
              <TH className="text-right">{t("cashDrawer.colClosing")}</TH>
              <TH className="text-right">{t("cashDrawer.colExpected")}</TH>
              <TH className="text-right">{t("cashDrawer.colDifference")}</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD className="whitespace-nowrap tabular-nums">{f.dateTime(row.openedAt)}</TD>
                <TD className="whitespace-nowrap tabular-nums">{f.dateTime(row.closedAt)}</TD>
                <TD>
                  <p>{row.openedBy ?? "—"}</p>
                  {row.closedBy && row.closedBy !== row.openedBy && (
                    <p className="text-xs text-muted-foreground">
                      {t("cashDrawer.closedBy", { name: row.closedBy })}
                    </p>
                  )}
                  {row.note && (
                    <p className="max-w-56 truncate text-xs text-muted-foreground" title={row.note}>
                      {row.note}
                    </p>
                  )}
                </TD>
                <TD className="text-right tabular-nums">{f.money(row.openingBalance)}</TD>
                <TD className="text-right tabular-nums">{f.money(row.countedCash)}</TD>
                <TD className="text-right tabular-nums">{f.money(row.expectedCash)}</TD>
                <TD className="text-right">
                  <Difference value={row.difference} f={f} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination page={page} pageCount={pageCountOf(total)} />
    </>
  );
}
