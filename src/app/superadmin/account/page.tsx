import { AccountCards } from "@/components/account-cards";
import { PageHeader } from "@/components/ui/page";
import { getT } from "@/i18n/server";
import { requireSuperAdmin } from "@/lib/auth";
import { pageTitle } from "@/lib/metadata";

export const generateMetadata = pageTitle("nav.account");

export default async function SuperAdminAccountPage() {
  const user = await requireSuperAdmin();
  const t = await getT();
  return (
    <>
      <PageHeader title={t("nav.account")} description={t("settings.accountDescription")} />
      <div className="grid max-w-xl gap-6">
        <AccountCards user={user} />
      </div>
    </>
  );
}
