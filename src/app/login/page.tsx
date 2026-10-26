import { Check } from "lucide-react";
import { redirect } from "next/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { DEMO_ACCOUNTS } from "@/db/seed";
import { getT } from "@/i18n/server";
import { getCurrentUser, homePathFor } from "@/lib/auth";
import { pageTitle } from "@/lib/metadata";
import { LoginForm, type DemoAccount } from "./login-form";

export const generateMetadata = pageTitle("auth.signIn");

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user));
  const t = await getT();

  // Demo accounts only exist in the local embedded database.
  const demoAccounts: DemoAccount[] = process.env.DATABASE_URL
    ? []
    : [
        { ...DEMO_ACCOUNTS.superadmin, label: t("nav.platformAdmin") },
        { ...DEMO_ACCOUNTS.admin, label: t("nav.pharmacyAdmin") },
        { ...DEMO_ACCOUNTS.staff, label: t("nav.staff") },
      ];

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-semibold tracking-tight">{t("auth.signInTitle")}</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">
            {t("auth.signInSubtitle")}
          </p>
          <LoginForm demoAccounts={demoAccounts} />
        </div>
      </div>

      <div className="hidden flex-col justify-center bg-primary px-12 text-primary-foreground lg:flex">
        <h2 className="max-w-md text-4xl leading-tight font-semibold">
          {t("auth.heroTitle")}
        </h2>
        <p className="mt-4 max-w-md text-lg opacity-90">{t("auth.heroBody")}</p>
        <ul className="mt-8 space-y-3">
          {[t("auth.heroPoint1"), t("auth.heroPoint2"), t("auth.heroPoint3")].map((point) => (
            <li key={point} className="flex items-center gap-3">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary-foreground/20">
                <Check className="size-4" />
              </span>
              {point}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
