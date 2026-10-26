import { getDb } from "@/db";
import { getT } from "@/i18n/server";
import { requireSuperAdmin } from "@/lib/auth";
import { METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/billing-labels";
import { csvResponse, type CsvCell } from "@/lib/csv";
import { todayInTimezone } from "@/lib/dates";
import { getFormat } from "@/lib/format-server";
import { PLATFORM_CURRENCY, PLATFORM_TIMEZONE } from "@/lib/platform";
import { intervalLabel, parsePaymentFilters, paymentWhere } from "../filters";
import { paymentRows } from "../queries";

/** All payments matching the list's filters, as CSV. */
export async function GET(request: Request) {
  await requireSuperAdmin();
  const [t, f, db] = await Promise.all([
    getT(),
    getFormat({ currency: PLATFORM_CURRENCY, timezone: PLATFORM_TIMEZONE }),
    getDb(),
  ]);
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const rows = await paymentRows(db, paymentWhere(parsePaymentFilters(params)));

  return csvResponse(`payments-${todayInTimezone(PLATFORM_TIMEZONE)}.csv`, [
    [
      t("billing.colDate"),
      t("billing.colPharmacy"),
      t("billing.colPlan"),
      t("billing.colInterval"),
      t("billing.colPeriod"),
      t("billing.colMethod"),
      t("billing.colStatus"),
      t("billing.colReference"),
      t("billing.colRecordedBy"),
      t("billing.colAmount"),
      t("billing.csvCurrency"),
    ],
    ...rows.map((row): CsvCell[] => {
      const interval = intervalLabel(row.months);
      return [
        f.dateTime(row.paidAt),
        row.pharmacyName,
        row.planName,
        interval ? t(interval) : row.months,
        row.periodEnd ? f.date(row.periodEnd) : null,
        t(METHOD_LABEL[row.method]),
        t(PAYMENT_STATUS_LABEL[row.status]),
        row.reference,
        row.recordedByName,
        row.amount,
        row.currency,
      ];
    }),
  ]);
}
