import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { currencyOptions, timezoneOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui/page";
import { getDb } from "@/db";
import { plans } from "@/db/schema";
import { getLocale, getT } from "@/i18n/server";
import { requireSuperAdmin } from "@/lib/auth";
import { getFormat } from "@/lib/format-server";
import { addDays, todayInTimezone } from "@/lib/dates";
import { pageTitle } from "@/lib/metadata";
import { addMonths } from "../../_lib/dates";
import { CreatePharmacyForm } from "./create-form";

export const generateMetadata = pageTitle("platform.newTitle");

const TRIAL_DAYS = 14;
// Same defaults as the pharmacies table. The suggested end dates count from
// today in the default time zone.
const DEFAULTS = { currency: "THB", timezone: "Asia/Bangkok" };

export default async function NewPharmacyPage() {
  await requireSuperAdmin();
  const [t, locale, db] = await Promise.all([getT(), getLocale(), getDb()]);

  const activePlans = await db
    .select()
    .from(plans)
    .where(eq(plans.isActive, true))
    .orderBy(asc(plans.sortOrder), asc(plans.name));
  const planOptions = await Promise.all(
    activePlans.map(async (plan) => {
      const price = (await getFormat(null, plan.currency)).money(plan.priceMonthly);
      return {
        value: plan.id,
        label: `${plan.name} · ${t("subscription.perMonth", { price })}`,
      };
    }),
  );

  const today = todayInTimezone(DEFAULTS.timezone);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/superadmin/pharmacies"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("platform.backToPharmacies")}
      </Link>
      <PageHeader title={t("platform.newTitle")} description={t("platform.newDescription")} />
      <CreatePharmacyForm
        defaults={DEFAULTS}
        currencyOptions={currencyOptions(locale)}
        timezoneOptions={timezoneOptions()}
        planOptions={planOptions}
        presets={{
          trial: addDays(today, TRIAL_DAYS),
          month: addMonths(today, 1),
          year: addMonths(today, 12),
        }}
        trialDays={TRIAL_DAYS}
      />
    </div>
  );
}
