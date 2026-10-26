import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { getLocale, getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { pageTitle } from "@/lib/metadata";
import { currencyOptions, timezoneOptions } from "@/lib/options";
import { ProfileForm } from "./profile-form";

export const generateMetadata = pageTitle("settings.title");

export default async function SettingsPage() {
  const { user, pharmacy } = await requirePharmacy();
  const t = await getT();
  const locale = await getLocale();

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
                taxRate: pharmacy.taxRate,
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
    </>
  );
}
