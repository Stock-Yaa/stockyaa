import { AccountCards } from "@/components/account-cards";
import { PageHeader } from "@/components/ui/page";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { pageTitle } from "@/lib/metadata";

export const generateMetadata = pageTitle("nav.profile");

export default async function ProfilePage() {
  const { user } = await requirePharmacy();
  const t = await getT();
  return (
    <>
      <PageHeader title={t("nav.profile")} description={t("settings.myProfileDescription")} />
      <div className="grid max-w-xl gap-6">
        <AccountCards user={user} emailHint={t("settings.signInEmailHint")} />
      </div>
    </>
  );
}
