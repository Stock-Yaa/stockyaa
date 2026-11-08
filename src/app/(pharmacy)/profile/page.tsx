import { eq } from "drizzle-orm";
import { AccountCards } from "@/components/account-cards";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { pageTitle } from "@/lib/metadata";
import { PinForm } from "./pin-form";

export const generateMetadata = pageTitle("nav.profile");

export default async function ProfilePage() {
  const { user } = await requirePharmacy();
  const [t, db] = await Promise.all([getT(), getDb()]);
  const [row] = await db
    .select({ pinHash: users.pinHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const hasPin = Boolean(row?.pinHash);

  return (
    <>
      <PageHeader title={t("nav.profile")} description={t("settings.myProfileDescription")} />
      <div className="grid max-w-xl gap-6">
        <AccountCards user={user} emailHint={t("settings.signInEmailHint")} />
        <Card>
          <CardHeader className="block">
            <CardTitle className="flex items-center gap-2">
              {t("users.myPinTitle")}
              <Badge tone={hasPin ? "success" : "warning"}>
                {hasPin ? t("users.pinSet") : t("users.pinNotSet")}
              </Badge>
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("users.myPinDescription")}</p>
          </CardHeader>
          <CardContent>
            <PinForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
