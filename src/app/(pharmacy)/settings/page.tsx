import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { getLocale, getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { pageTitle } from "@/lib/metadata";
import { currencyOptions, timezoneOptions } from "@/lib/options";
import { todayInTimezone } from "@/lib/dates";
import { getDb } from "@/db";
import { NUMBER_SERIES, branchCodeOf, counterScope, getCounter, seriesFormat } from "@/lib/numbering";
import { CashRulesForm } from "./cash-rules-form";
import { InvoiceFormatForm } from "./invoice-format-form";
import { ProfileForm } from "./profile-form";

export const generateMetadata = pageTitle("settings.title");

export default async function SettingsPage() {
  const { user, pharmacy, branch, branches } = await requirePharmacy();
  const t = await getT();
  const locale = await getLocale();
  const db = await getDb();
  // Where each document counter of the current branch is, for the number preview.
  const counters = Object.fromEntries(
    await Promise.all(
      NUMBER_SERIES.map(async (series) => [
        series,
        {
          ...(await getCounter(db, pharmacy.id, series, counterScope(pharmacy, branch))),
          prefix: seriesFormat(pharmacy, series, branch).invoicePrefix,
        },
      ]),
    ),
  );

  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      <Card className="max-w-4xl">
        <CardHeader className="block">
          <CardTitle>{t("settings.profileTitle")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("settings.profileDescription")}
          </p>
        </CardHeader>
        <CardContent>
          {user.role === "admin" ? (
            <ProfileForm
              profile={{
                name: pharmacy.name,
                phone: pharmacy.phone,
                email: pharmacy.email,
                address: pharmacy.address,
                licenseNumber: pharmacy.licenseNumber,
                taxId: pharmacy.taxId,
                currency: pharmacy.currency,
                timezone: pharmacy.timezone,
                vatRegistered: pharmacy.vatRegistered,
                taxRate: pharmacy.taxRate,
                memberDiscount: pharmacy.memberDiscount,
                staffDiscount: pharmacy.staffDiscount,
                expiryAlertDays: pharmacy.expiryAlertDays,
                receiptFooter: pharmacy.receiptFooter,
              }}
              currencyOptions={currencyOptions(locale, pharmacy.currency)}
              timezoneOptions={timezoneOptions(pharmacy.timezone)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("settings.adminOnly")}</p>
          )}
        </CardContent>
      </Card>

      {user.role === "admin" && (
        <Card className="mt-6 max-w-4xl">
          <CardHeader className="block">
            <CardTitle>{t("settings.invoiceFormatTitle")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("settings.invoiceFormatDescription")}</p>
          </CardHeader>
          <CardContent>
            <InvoiceFormatForm
              settings={{
                invoicePrefix: pharmacy.invoicePrefix,
                taxInvoicePrefix: pharmacy.taxInvoicePrefix,
                creditNotePrefix: pharmacy.creditNotePrefix,
                purchasePrefix: pharmacy.purchasePrefix,
                transferPrefix: pharmacy.transferPrefix,
                invoiceDateFormat: pharmacy.invoiceDateFormat,
                invoiceBuddhistYear: pharmacy.invoiceBuddhistYear,
                invoiceDigits: pharmacy.invoiceDigits,
                numberPerBranch: pharmacy.numberPerBranch,
              }}
              today={todayInTimezone(pharmacy.timezone)}
              branchCode={branchCodeOf(branch)}
              counters={counters as Parameters<typeof InvoiceFormatForm>[0]["counters"]}
              showTransfers={branches.length > 1}
            />
          </CardContent>
        </Card>
      )}

      {user.role === "admin" && (
        <Card className="mt-6 max-w-4xl">
          <CardHeader className="block">
            <CardTitle>{t("settings.cashRulesTitle")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("settings.cashRulesDescription")}</p>
          </CardHeader>
          <CardContent>
            <CashRulesForm
              rules={{
                cashMinorTolerance: pharmacy.cashMinorTolerance,
                cashMajorTolerance: pharmacy.cashMajorTolerance,
                payoutApprovalLimit: pharmacy.payoutApprovalLimit,
                cashRecounts: pharmacy.cashRecounts,
              }}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
