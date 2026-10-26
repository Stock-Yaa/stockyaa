import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-5xl font-semibold text-primary">404</p>
      <h1 className="text-xl font-semibold">{t("common.pageNotFound")}</h1>
      <p className="text-sm text-muted-foreground">{t("common.pageNotFoundBody")}</p>
      <Link href="/" className={buttonClass({ className: "mt-4" })}>
        {t("common.goHome")}
      </Link>
    </div>
  );
}
