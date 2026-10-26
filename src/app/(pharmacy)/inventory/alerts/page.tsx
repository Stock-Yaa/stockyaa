import { CalendarClock, CalendarX, CircleCheck, PackageX, ShoppingCart, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Badge, StatCard } from "@/components/ui/card";
import { FilterSelect, Pagination, SearchInput } from "@/components/ui/list-controls";
import { EmptyState, PageHeader, Toolbar } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import type { MessageKey, Translate } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { branchScope } from "@/lib/branches";
import { addDays, daysBetween, todayInTimezone } from "@/lib/dates";
import type { Format } from "@/lib/format";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { PAGE_SIZE, pageCountOf, parsePage } from "@/lib/pagination";
import { getBatchesExpiringBetween, getLowStockProducts } from "@/lib/reports";
import { AdjustStockButton } from "../adjust-stock-form";

export const generateMetadata = pageTitle("nav.stockAlerts");

// Most urgent first: this order is also the "most urgent" sort.
const TYPES = ["expired", "out", "expiring", "low"] as const;
type AlertType = (typeof TYPES)[number];

const TYPE_INFO: Record<
  AlertType,
  { label: MessageKey; tone: "danger" | "warning" | "info" }
> = {
  expired: { label: "inventory.alertExpired", tone: "danger" },
  out: { label: "inventory.alertOut", tone: "danger" },
  expiring: { label: "inventory.alertExpiring", tone: "info" },
  low: { label: "inventory.alertLow", tone: "warning" },
};

const SORTS = ["urgent", "name", "name-desc"] as const;
const PER_PAGE = [PAGE_SIZE, 50, 100];

type Alert = {
  key: string;
  type: AlertType;
  productName: string;
  details: (string | null)[];
  unit: string;
  quantity: number;
  /** Lower comes first within a type when sorting by urgency. */
  urgency: number;
  search: string;
  reorderLevel?: number;
  batch?: { id: string; batchNumber: string | null; expiryDate: string };
};

export default async function StockAlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; sort?: string; per?: string; page?: string }>;
}) {
  const { pharmacy, branch } = await requirePharmacy();
  const [t, f, db] = await Promise.all([getT(), getFormat(pharmacy), getDb()]);
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const type = TYPES.find((value) => value === params.type) ?? null;
  const sort = SORTS.find((value) => value === params.sort) ?? "urgent";
  const perPage = PER_PAGE.find((value) => String(value) === params.per) ?? PAGE_SIZE;
  const page = parsePage(params.page);

  const today = todayInTimezone(pharmacy.timezone);
  const alertUntil = addDays(today, pharmacy.expiryAlertDays);

  // Alerts are few compared with the catalogue, so they are merged, searched,
  // sorted and paged here rather than in one SQL query. Alerts are for the
  // current branch: its stock against each product's reorder level.
  const scope = branchScope(branch);
  const [lowProducts, expiringBatches] = await Promise.all([
    getLowStockProducts(db, scope, today),
    getBatchesExpiringBetween(db, scope, null, alertUntil),
  ]);

  const alerts: Alert[] = [
    ...lowProducts.map((p) => ({
      key: `product-${p.id}`,
      type: p.quantity === 0 ? ("out" as const) : ("low" as const),
      productName: p.name,
      details: [p.strength, p.dosageForm],
      unit: p.unit,
      quantity: p.quantity,
      urgency: p.reorderLevel > 0 ? p.quantity / p.reorderLevel : 0,
      search: [p.name, p.genericName].join(" "),
      reorderLevel: p.reorderLevel,
    })),
    ...expiringBatches.flatMap((b) =>
      b.expiryDate
        ? [
            {
              key: `batch-${b.id}`,
              type: b.expiryDate < today ? ("expired" as const) : ("expiring" as const),
              productName: b.productName,
              details: [b.strength, b.dosageForm],
              unit: b.unit,
              quantity: b.quantity,
              urgency: daysBetween(today, b.expiryDate),
              search: [b.productName, b.batchNumber].join(" "),
              batch: { id: b.id, batchNumber: b.batchNumber, expiryDate: b.expiryDate },
            },
          ]
        : [],
    ),
  ];

  const counts = Object.fromEntries(
    TYPES.map((value) => [value, alerts.filter((a) => a.type === value).length]),
  ) as Record<AlertType, number>;

  const needle = q.toLocaleLowerCase();
  const collator = new Intl.Collator(f.locale);
  const byName = (a: Alert, b: Alert) => collator.compare(a.productName, b.productName);
  const shown = alerts
    .filter((a) => (!type || a.type === type) && a.search.toLocaleLowerCase().includes(needle))
    .sort((a, b) => {
      if (sort === "name") return byName(a, b);
      if (sort === "name-desc") return byName(b, a);
      return (
        TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || a.urgency - b.urgency || byName(a, b)
      );
    });

  const pageCount = pageCountOf(shown.length, perPage);
  const start = (Math.min(page, pageCount) - 1) * perPage;
  const rows = shown.slice(start, start + perPage);

  // A card shows its alert type; clicking the active one goes back to all.
  const cardFilter = (value: AlertType) => {
    const query = new URLSearchParams();
    for (const key of ["q", "sort", "per"] as const) {
      if (params[key]) query.set(key, params[key]);
    }
    if (type !== value) query.set("type", value);
    const search = query.toString();
    return {
      href: search ? `/inventory/alerts?${search}` : "/inventory/alerts",
      active: type === value,
    };
  };

  return (
    <>
      <PageHeader title={t("nav.stockAlerts")} description={t("inventory.alertsDescription")} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("inventory.alertOut")}
          value={f.number(counts.out)}
          hint={t("inventory.alertOutHint")}
          icon={PackageX}
          tone="danger"
          {...cardFilter("out")}
        />
        <StatCard
          label={t("inventory.alertLow")}
          value={f.number(counts.low)}
          hint={t("inventory.alertLowHint")}
          icon={TriangleAlert}
          tone="warning"
          {...cardFilter("low")}
        />
        <StatCard
          label={t("inventory.alertExpiring")}
          value={f.number(counts.expiring)}
          hint={t("inventory.alertExpiringHint", { days: pharmacy.expiryAlertDays })}
          icon={CalendarClock}
          tone="info"
          {...cardFilter("expiring")}
        />
        <StatCard
          label={t("inventory.alertExpired")}
          value={f.number(counts.expired)}
          hint={t("inventory.alertExpiredHint")}
          icon={CalendarX}
          tone="danger"
          {...cardFilter("expired")}
        />
      </div>

      <Toolbar>
        <SearchInput placeholder={t("inventory.alertsSearchPlaceholder")} />
        <FilterSelect
          param="type"
          aria-label={t("inventory.filterLabel")}
          options={[
            { value: "", label: t("inventory.alertFilterAll") },
            ...TYPES.map((value) => ({ value, label: t(TYPE_INFO[value].label) })),
          ]}
        />
        <FilterSelect
          param="sort"
          aria-label={t("inventory.alertSortLabel")}
          options={[
            { value: "", label: t("inventory.alertSortUrgent") },
            { value: "name", label: t("inventory.alertSortName") },
            { value: "name-desc", label: t("inventory.alertSortNameDesc") },
          ]}
        />
        <FilterSelect
          param="per"
          aria-label={t("inventory.perPageLabel")}
          className="min-w-0"
          options={PER_PAGE.map((value, index) => ({
            value: index === 0 ? "" : String(value),
            label: t("inventory.perPage", { count: value }),
          }))}
        />
        {shown.length > 0 && (
          <p className="text-sm text-muted-foreground sm:ml-auto">
            {t("inventory.showingRange", {
              from: f.number(start + 1),
              to: f.number(start + rows.length),
              total: f.number(shown.length),
            })}
          </p>
        )}
      </Toolbar>

      {rows.length === 0 ? (
        alerts.length === 0 ? (
          <EmptyState
            icon={CircleCheck}
            title={t("inventory.noAlerts")}
            hint={t("inventory.noAlertsHint")}
          />
        ) : (
          <EmptyState
            icon={TriangleAlert}
            title={t("common.noResults")}
            hint={t("inventory.noMatchHint")}
          />
        )
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("inventory.product")}</TH>
                <TH>{t("inventory.alert")}</TH>
                <TH>{t("inventory.details")}</TH>
                <TH className="text-right">{t("common.quantity")}</TH>
                <TH className="text-right">{t("common.actions")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((alert) => (
                <TR key={alert.key}>
                  <TD>
                    <p className="font-medium">{alert.productName}</p>
                    {alert.details.some(Boolean) && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {alert.details.filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={TYPE_INFO[alert.type].tone}>
                      {t(TYPE_INFO[alert.type].label)}
                    </Badge>
                  </TD>
                  <TD className="text-muted-foreground">
                    <AlertDetails alert={alert} t={t} f={f} />
                  </TD>
                  <TD className="text-right whitespace-nowrap tabular-nums">
                    {f.number(alert.quantity)}{" "}
                    <span className="text-muted-foreground">{alert.unit}</span>
                  </TD>
                  <TD>
                    <div className="flex justify-end">
                      {alert.batch ? (
                        <AdjustStockButton
                          batch={{
                            id: alert.batch.id,
                            productName: alert.productName,
                            batchNumber: alert.batch.batchNumber,
                            quantity: alert.quantity,
                            unit: alert.unit,
                          }}
                        />
                      ) : (
                        <Link
                          href="/purchases/new"
                          className={buttonClass({ variant: "outline", size: "sm" })}
                        >
                          <ShoppingCart />
                          {t("inventory.reorder")}
                        </Link>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={Math.min(page, pageCount)} pageCount={pageCount} />
        </>
      )}
    </>
  );
}

/** What the alert is about: stock against the reorder level, or the expiry. */
function AlertDetails({
  alert,
  t,
  f,
}: {
  alert: Alert;
  t: Translate;
  f: Format;
}) {
  if (!alert.batch) {
    return t("inventory.stockLeft", {
      quantity: f.number(alert.quantity),
      unit: alert.unit,
      level: f.number(alert.reorderLevel),
    });
  }
  const days = alert.urgency;
  const date = f.day(alert.batch.expiryDate);
  return (
    <>
      <p>
        {days === 0
          ? t("inventory.expiresToday")
          : days > 0
            ? t("inventory.expiresIn", { date, days: f.number(days) })
            : t("inventory.expiredAgo", { date, days: f.number(-days) })}
      </p>
      {alert.batch.batchNumber && (
        <p className="mt-0.5 text-xs">
          {t("inventory.batchLabel", { batch: alert.batch.batchNumber })}
        </p>
      )}
    </>
  );
}
