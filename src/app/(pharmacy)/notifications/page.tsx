import { and, count, desc, isNull, sql } from "drizzle-orm";
import { Bell } from "lucide-react";
import Link from "next/link";
import { Pagination } from "@/components/ui/list-controls";
import { EmptyState } from "@/components/ui/page";
import { getDb } from "@/db";
import { notifications, type Notification, type NotificationType } from "@/db/schema";
import type { MessageKey, Translate } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { canSwitchBranch } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { listBranches } from "@/lib/branches";
import type { Format } from "@/lib/format";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { visibleNotifications } from "@/lib/notifications";
import { pageCountOf, parsePage } from "@/lib/pagination";
import { now } from "@/lib/time";
import { cn } from "@/lib/utils";
import { MarkAllReadButton, NotificationItem, ScanNowButton } from "./notification-controls";

export const generateMetadata = pageTitle("notifications.title");

const PER_PAGE = 30;

const URGENCY_ORDER: NotificationType[] = [
  "subscription_ended",
  "cash_review",
  "out_of_stock",
  "expired",
  "low_stock",
  "subscription_ending",
  "expiring",
];
const URGENCY = sql`array_position(array[${sql.join(
  URGENCY_ORDER.map((type) => sql`${type}`),
  sql`, `,
)}]::text[], ${notifications.type})`;

const TEXT: Record<NotificationType, { title: MessageKey; body: MessageKey; href: string }> = {
  out_of_stock: {
    title: "notifications.outOfStockTitle",
    body: "notifications.outOfStockBody",
    href: "/inventory/alerts?type=out",
  },
  low_stock: {
    title: "notifications.lowStockTitle",
    body: "notifications.lowStockBody",
    href: "/inventory/alerts?type=low",
  },
  expired: {
    title: "notifications.expiredTitle",
    body: "notifications.expiredBody",
    href: "/inventory/alerts?type=expired",
  },
  expiring: {
    title: "notifications.expiringTitle",
    body: "notifications.expiringBody",
    href: "/inventory/alerts?type=expiring",
  },
  subscription_ended: {
    title: "notifications.subscriptionEndedTitle",
    body: "notifications.subscriptionEndedBody",
    href: "/subscription",
  },
  subscription_ending: {
    title: "notifications.subscriptionEndingTitle",
    body: "notifications.subscriptionEndingBody",
    href: "/subscription",
  },
  // The body depends on the kind of review (see CASH_REVIEW_BODY).
  cash_review: {
    title: "notifications.cashReviewTitle",
    body: "notifications.cashVarianceBody",
    href: "/cash-drawer?tab=review",
  },
};

const CASH_REVIEW_BODY: Record<string, MessageKey> = {
  variance: "notifications.cashVarianceBody",
  variance_blocked: "notifications.cashVarianceBlockedBody",
  opening: "notifications.cashOpeningBody",
  payout: "notifications.cashPayoutBody",
};

/** Title and body in the reader's language, from the stored figures. */
function describe(n: Notification, t: Translate, f: Format) {
  const d = n.data;
  const vars = {
    name: String(d.name ?? ""),
    unit: String(d.unit ?? ""),
    quantity: f.number(Number(d.quantity ?? 0)),
    reorderLevel: f.number(Number(d.reorderLevel ?? 0)),
    batch: d.batchNumber ? String(d.batchNumber) : t("notifications.noBatchNumber"),
    date:
      typeof d.expiryDate === "string"
        ? f.day(d.expiryDate)
        : typeof d.endsAt === "string"
          ? f.dateTime(d.endsAt)
          : "",
  };
  const text = TEXT[n.type];
  if (n.type === "cash_review") {
    const amount = Number(d.amount ?? 0);
    const cash = {
      drawer: String(d.drawer ?? ""),
      staff: String(d.staff ?? ""),
      // A difference is signed (short or over); a pay-out amount is not.
      amount: d.kind === "payout" ? f.money(amount) : `${amount > 0 ? "+" : ""}${f.money(amount)}`,
    };
    const kind = d.kind === "variance" && d.blocking === 1 ? "variance_blocked" : String(d.kind);
    return { title: t(text.title), body: t(CASH_REVIEW_BODY[kind] ?? text.body, cash), href: text.href };
  }
  return { title: t(text.title, vars), body: t(text.body, vars), href: text.href };
}

function timeAgo(createdAt: Date, current: Date, t: Translate, f: Format): string {
  const minutes = Math.floor((current.getTime() - createdAt.getTime()) / 60_000);
  if (minutes < 1) return t("notifications.justNow");
  if (minutes < 60) return t("notifications.minutesAgo", { count: minutes });
  if (minutes < 24 * 60) return t("notifications.hoursAgo", { count: Math.floor(minutes / 60) });
  return f.dateTime(createdAt);
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const viewer = await requirePharmacy();
  const { user, pharmacy, branches } = viewer;
  const [t, f, db] = await Promise.all([getT(), getFormat(pharmacy), getDb()]);
  const params = await searchParams;
  const unreadOnly = params.filter === "unread";
  const page = parsePage(params.page);

  // Admins see every branch's alerts; with several branches each stock alert
  // names its branch. Staff see only their branch, so no names are needed.
  const showBranch = canSwitchBranch(user) && branches.length > 1;
  const mine = visibleNotifications(viewer);
  const where = unreadOnly ? and(mine, isNull(notifications.readAt)) : mine;
  const [[{ unread }], [{ total }], rows, allBranches] = await Promise.all([
    db
      .select({ unread: count() })
      .from(notifications)
      .where(and(mine, isNull(notifications.readAt))),
    db.select({ total: count() }).from(notifications).where(where),
    db
      .select()
      .from(notifications)
      .where(where)
      // One scan creates its alerts at the same moment: most urgent first.
      .orderBy(desc(notifications.createdAt), URGENCY, desc(notifications.id))
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE),
    // Inactive branches too: their older alerts may still be listed.
    showBranch ? listBranches(db, pharmacy.id) : [],
  ]);
  const branchNames = new Map(allBranches.map((b) => [b.id, b.name]));
  const current = now();

  const tab = (active: boolean) =>
    cn(
      "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
      active
        ? "border-primary text-primary"
        : "border-transparent text-muted-foreground hover:text-foreground",
    );

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Bell className="size-6" aria-hidden />
            {t("notifications.title")}
            {unread > 0 && (
              <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground tabular-nums">
                {f.number(unread)}
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("notifications.description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScanNowButton />
          <MarkAllReadButton disabled={unread === 0} />
        </div>
      </div>

      <nav className="mb-4 flex border-b border-border">
        <Link
          href="/notifications"
          aria-current={unreadOnly ? undefined : "page"}
          className={tab(!unreadOnly)}
        >
          {t("notifications.all")}
        </Link>
        <Link
          href="/notifications?filter=unread"
          aria-current={unreadOnly ? "page" : undefined}
          className={tab(unreadOnly)}
        >
          {t("notifications.unread", { count: f.number(unread) })}
        </Link>
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={unreadOnly ? t("notifications.emptyUnread") : t("notifications.empty")}
          hint={unreadOnly ? undefined : t("notifications.emptyHint")}
        />
      ) : (
        <>
          <ul className="grid gap-3">
            {rows.map((n) => {
              const text = describe(n, t, f);
              return (
                <li key={n.id}>
                  <NotificationItem
                    id={n.id}
                    type={n.type}
                    title={text.title}
                    body={text.body}
                    href={text.href}
                    time={timeAgo(n.createdAt, current, t, f)}
                    unread={n.readAt === null}
                    branch={(n.branchId && branchNames.get(n.branchId)) || undefined}
                  />
                </li>
              );
            })}
          </ul>
          <Pagination page={page} pageCount={pageCountOf(total, PER_PAGE)} />
        </>
      )}
    </>
  );
}
