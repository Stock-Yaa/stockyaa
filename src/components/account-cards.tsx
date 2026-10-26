import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getT } from "@/i18n/server";
import { AccountNameForm, PasswordForm } from "./account-form";

/** "My account" and "Change password" cards for the signed-in user. */
export async function AccountCards({
  user,
  emailHint,
}: {
  user: { name: string; email: string };
  /** Shown under the read-only sign-in email. */
  emailHint?: string;
}) {
  const t = await getT();
  return (
    <>
      <Card>
        <CardHeader className="block">
          <CardTitle>{t("settings.accountTitle")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("settings.accountDescription")}
          </p>
        </CardHeader>
        <CardContent>
          <AccountNameForm name={user.name} email={user.email} emailHint={emailHint} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="block">
          <CardTitle>{t("settings.passwordTitle")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("settings.passwordDescription")}
          </p>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </>
  );
}
