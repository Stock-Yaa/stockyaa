import { SearchX } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";
import { getT } from "@/i18n/server";

/** "Not found" message shown inside the app shell, with a link back to `homeHref`. */
export async function NotFoundPanel({ homeHref }: { homeHref: string }) {
  const t = await getT();
  return (
    <EmptyState
      icon={SearchX}
      title={t("common.pageNotFound")}
      hint={t("common.pageNotFoundBody")}
    >
      <Link href={homeHref} className={buttonClass({ variant: "outline" })}>
        {t("common.goHome")}
      </Link>
    </EmptyState>
  );
}
