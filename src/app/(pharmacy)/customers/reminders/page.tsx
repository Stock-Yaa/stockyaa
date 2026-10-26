import { and, asc, count, desc, eq, ilike, lte, or } from "drizzle-orm";
import { AlarmClock, Bell, Check, Clock, Phone, Trash2 } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Pagination, SearchInput } from "@/components/ui/list-controls";
import { EmptyState, Toolbar } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { customers, products, refillReminders } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { addDays, daysBetween, todayInTimezone } from "@/lib/dates";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { PAGE_SIZE, likePattern, pageCountOf, parsePage } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { deleteReminder, markRefilled } from "./actions";
import { ReminderFormButton } from "./reminder-form";

export const generateMetadata = pageTitle("nav.refillReminders");

// A reminder is "due" this many days ahead, so there is time to call.
const DUE_SOON_DAYS = 3;

const TABS = ["due", "all"] as const;
type Tab = (typeof TABS)[number];

export default async function RefillRemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  const { pharmacy } = await requirePharmacy();
  const [t, f, db, params] = await Promise.all([
    getT(),
    getFormat(pharmacy),
    getDb(),
    searchParams,
  ]);
  const tab: Tab = TABS.find((x) => x === params.tab) ?? "due";
  const page = parsePage(params.page);
  const today = todayInTimezone(pharmacy.timezone);
  const dueBy = addDays(today, DUE_SOON_DAYS);

  const mine = eq(refillReminders.pharmacyId, pharmacy.id);
  const due = and(mine, eq(refillReminders.isActive, true), lte(refillReminders.nextDueDate, dueBy));
  const pattern = params.q ? likePattern(params.q) : null;
  const where = and(
    tab === "due" ? due : mine,
    pattern
      ? or(ilike(customers.name, pattern), ilike(customers.phone, pattern), ilike(products.name, pattern))
      : undefined,
  );
  // Customers and products are joined on the pharmacy too, so a row can never
  // show another tenant's names.
  const customerJoin = and(
    eq(customers.id, refillReminders.customerId),
    eq(customers.pharmacyId, pharmacy.id),
  );
  const productJoin = and(
    eq(products.id, refillReminders.productId),
    eq(products.pharmacyId, pharmacy.id),
  );

  const [[{ dueCount }], [{ allCount }], [{ total }], rows, customerOptions, productOptions] =
    await Promise.all([
      db.select({ dueCount: count() }).from(refillReminders).where(due),
      db.select({ allCount: count() }).from(refillReminders).where(mine),
      db
        .select({ total: count() })
        .from(refillReminders)
        .innerJoin(customers, customerJoin)
        .innerJoin(products, productJoin)
        .where(where),
      db
        .select({
          id: refillReminders.id,
          customerId: customers.id,
          customerName: customers.name,
          phone: customers.phone,
          productName: products.name,
          strength: products.strength,
          intervalDays: refillReminders.intervalDays,
          nextDueDate: refillReminders.nextDueDate,
          lastRefillDate: refillReminders.lastRefillDate,
          isActive: refillReminders.isActive,
          notes: refillReminders.notes,
        })
        .from(refillReminders)
        .innerJoin(customers, customerJoin)
        .innerJoin(products, productJoin)
        .where(where)
        // Paused reminders last; otherwise the soonest due first.
        .orderBy(desc(refillReminders.isActive), asc(refillReminders.nextDueDate), asc(customers.name))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE),
      db
        .select({ id: customers.id, name: customers.name, phone: customers.phone })
        .from(customers)
        .where(eq(customers.pharmacyId, pharmacy.id))
        .orderBy(asc(customers.name)),
      db
        .select({ id: products.id, name: products.name, strength: products.strength })
        .from(products)
        .where(and(eq(products.pharmacyId, pharmacy.id), eq(products.isActive, true)))
        .orderBy(asc(products.name)),
    ]);

  const tabHref = (target: Tab) => {
    const query = new URLSearchParams();
    if (target !== "due") query.set("tab", target);
    if (params.q) query.set("q", params.q);
    const qs = query.toString();
    return qs ? `/customers/reminders?${qs}` : "/customers/reminders";
  };
  const tabCount: Record<Tab, number> = { due: dueCount, all: allCount };
  const productLabel = (name: string, strength: string | null) =>
    strength ? `${name} (${strength})` : name;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Clock className="size-6 shrink-0 text-info" />
            {t("refills.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("refills.description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium",
              dueCount > 0
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-border bg-muted text-muted-foreground",
            )}
          >
            <Bell className="size-3.5" />
            {t("refills.dueBadge", { count: f.number(dueCount) })}
          </span>
          <ReminderFormButton
            today={today}
            customers={customerOptions.map((c) => ({
              id: c.id,
              label: c.phone ? `${c.name} · ${c.phone}` : c.name,
            }))}
            products={productOptions.map((p) => ({ id: p.id, label: productLabel(p.name, p.strength) }))}
          />
        </div>
      </div>

      <nav className="mb-5 flex gap-1 border-b border-border" aria-label={t("refills.title")}>
        {TABS.map((id) => (
          <Link
            key={id}
            href={tabHref(id)}
            aria-current={id === tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-3 text-sm font-medium transition-colors",
              id === tab
                ? "border-info text-info"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(id === "due" ? "refills.tabDue" : "refills.tabAll", {
              count: f.number(tabCount[id]),
            })}
          </Link>
        ))}
      </nav>

      <Toolbar>
        <SearchInput placeholder={t("refills.searchPlaceholder")} className="sm:w-full" />
      </Toolbar>

      {rows.length === 0 ? (
        params.q ? (
          <EmptyState icon={Clock} title={t("common.noResults")} hint={t("common.noResultsHint")} />
        ) : tab === "due" ? (
          <EmptyState
            icon={Clock}
            title={t("refills.noDue")}
            hint={t("refills.noDueHint", { days: DUE_SOON_DAYS })}
          />
        ) : (
          <EmptyState icon={AlarmClock} title={t("refills.empty")} hint={t("refills.emptyHint")} />
        )
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("refills.customer")}</TH>
                <TH>{t("refills.product")}</TH>
                <TH>{t("refills.every")}</TH>
                <TH>{t("refills.lastRefill")}</TH>
                <TH>{t("refills.nextDue")}</TH>
                <TH className="text-right">{t("common.actions")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => {
                const daysLeft = daysBetween(today, r.nextDueDate);
                const status = !r.isActive
                  ? { tone: "muted" as const, label: t("refills.paused") }
                  : daysLeft < 0
                    ? { tone: "danger" as const, label: t("refills.overdue", { days: f.number(-daysLeft) }) }
                    : daysLeft === 0
                      ? { tone: "warning" as const, label: t("refills.dueToday") }
                      : {
                          tone: daysLeft <= DUE_SOON_DAYS ? ("warning" as const) : ("muted" as const),
                          label: t("refills.dueIn", { days: f.number(daysLeft) }),
                        };
                const product = productLabel(r.productName, r.strength);
                return (
                  <TR key={r.id} className={cn(!r.isActive && "opacity-60")}>
                    <TD>
                      <Link href={`/customers/${r.customerId}`} className="font-medium whitespace-nowrap hover:underline">
                        {r.customerName}
                      </Link>
                      {r.phone && (
                        <a
                          href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}
                          className="mt-0.5 flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground hover:text-foreground"
                        >
                          <Phone className="size-3" />
                          {r.phone}
                        </a>
                      )}
                    </TD>
                    <TD>
                      {product}
                      {r.notes && (
                        <p className="mt-0.5 max-w-64 truncate text-xs text-muted-foreground" title={r.notes}>
                          {r.notes}
                        </p>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {t("refills.everyDays", { days: f.number(r.intervalDays) })}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {r.lastRefillDate ? f.day(r.lastRefillDate) : "—"}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {f.day(r.nextDueDate)}
                      <span className="mt-0.5 block">
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </span>
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        {r.isActive && (
                          <ConfirmButton
                            action={markRefilled.bind(null, r.id)}
                            title={t("refills.markRefilled")}
                            body={t("refills.markRefilledBody", {
                              customer: r.customerName,
                              product,
                              date: f.day(addDays(today, r.intervalDays)),
                            })}
                            confirmLabel={t("refills.markRefilled")}
                            variant="ghost"
                            size="icon"
                            aria-label={t("refills.markRefilled")}
                          >
                            <Check />
                          </ConfirmButton>
                        )}
                        <ReminderFormButton
                          today={today}
                          reminder={{
                            id: r.id,
                            customerName: r.customerName,
                            productName: product,
                            intervalDays: r.intervalDays,
                            nextDueDate: r.nextDueDate,
                            isActive: r.isActive,
                            notes: r.notes,
                          }}
                        />
                        <ConfirmButton
                          action={deleteReminder.bind(null, r.id)}
                          body={t("refills.deleteBody")}
                          destructive
                          variant="ghost"
                          size="icon"
                          aria-label={t("common.delete")}
                        >
                          <Trash2 />
                        </ConfirmButton>
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
