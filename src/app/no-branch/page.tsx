import { LogOut, MapPinOff } from "lucide-react";
import { redirect } from "next/navigation";
import { logout } from "@/app/login/actions";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";
import { getT } from "@/i18n/server";
import { homePathFor, requireUser } from "@/lib/auth";
import { pageTitle } from "@/lib/metadata";

export const generateMetadata = pageTitle("branches.noBranchTitle");

/**
 * Where requirePharmacy() sends a staff member who has no active branch to
 * work in. It must not call requirePharmacy() itself, which would loop.
 */
export default async function NoBranchPage() {
  const user = await requireUser();
  if (user.role === "superadmin") redirect(homePathFor(user));
  const t = await getT();

  return (
    <div className="flex min-h-dvh flex-col px-6 py-6 sm:px-10">
      <div className="flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
        <EmptyState
          icon={MapPinOff}
          title={t("branches.noBranchTitle")}
          hint={t("branches.noBranchBody")}
        >
          <form action={logout}>
            <Button type="submit" variant="outline">
              <LogOut />
              {t("common.signOut")}
            </Button>
          </form>
        </EmptyState>
      </div>
    </div>
  );
}
