import Link from "next/link";
import { Badge } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import type { BillingPayment } from "@/db/schema";
import type { Translate } from "@/i18n/messages";
import { METHOD_LABEL, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from "@/lib/billing-labels";
import type { Format } from "@/lib/format";
import { intervalLabel } from "./filters";

/** "Monthly", "Yearly", "3 months" or a dash. */
function intervalText(months: number | null, t: Translate): string {
  const label = intervalLabel(months);
  if (label) return t(label);
  return months ? t("billing.monthsCount", { count: months }) : "—";
}

export type PaymentRow = Pick<
  BillingPayment,
  | "id"
  | "pharmacyId"
  | "pharmacyName"
  | "planName"
  | "months"
  | "amount"
  | "currency"
  | "method"
  | "status"
  | "periodEnd"
  | "reference"
  | "paidAt"
> & { recordedByName: string | null };

/** Payments as a table. `showPharmacy` adds the pharmacy column (the all-payments page). */
export function PaymentsTable({
  rows,
  t,
  format,
  moneyFormats,
  showPharmacy,
}: {
  rows: PaymentRow[];
  t: Translate;
  format: Format;
  /** Formatter per currency; payments can be in different currencies. */
  moneyFormats: Map<string, Format>;
  showPharmacy?: boolean;
}) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>{t("billing.colDate")}</TH>
          {showPharmacy && <TH>{t("billing.colPharmacy")}</TH>}
          <TH>{t("billing.colPlan")}</TH>
          <TH>{t("billing.colInterval")}</TH>
          <TH>{t("billing.colPeriod")}</TH>
          <TH>{t("billing.colMethod")}</TH>
          <TH>{t("billing.colReference")}</TH>
          <TH>{t("billing.colRecordedBy")}</TH>
          <TH className="text-right">{t("billing.colAmount")}</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.id}>
            <TD className="whitespace-nowrap">{format.date(row.paidAt)}</TD>
            {showPharmacy && (
              <TD className="font-medium">
                {row.pharmacyId ? (
                  <Link
                    href={`/superadmin/pharmacies/${row.pharmacyId}`}
                    className="hover:text-primary hover:underline"
                  >
                    {row.pharmacyName}
                  </Link>
                ) : (
                  t("billing.deletedPharmacy", { name: row.pharmacyName })
                )}
              </TD>
            )}
            <TD>{row.planName ?? "—"}</TD>
            <TD className="whitespace-nowrap">{intervalText(row.months, t)}</TD>
            <TD className="whitespace-nowrap">{format.date(row.periodEnd)}</TD>
            <TD>
              <div className="flex flex-wrap gap-1">
                <Badge tone="muted">{t(METHOD_LABEL[row.method])}</Badge>
                {row.status !== "succeeded" && (
                  <Badge tone={PAYMENT_STATUS_TONE[row.status]}>
                    {t(PAYMENT_STATUS_LABEL[row.status])}
                  </Badge>
                )}
              </div>
            </TD>
            <TD className="text-muted-foreground">{row.reference ?? "—"}</TD>
            <TD className="text-muted-foreground">{row.recordedByName ?? "—"}</TD>
            <TD className="text-right font-medium whitespace-nowrap tabular-nums">
              {(moneyFormats.get(row.currency) ?? format).money(row.amount)}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
