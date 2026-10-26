import { Clock, House, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";

/**
 * Page for a pharmacy module that is in the sidebar but not built yet. Says
 * so plainly and describes what it will do; it never shows sample data.
 */
export async function ComingSoon({
  title,
  description,
  icon: Icon,
}: {
  title: MessageKey;
  description: MessageKey;
  icon: LucideIcon;
}) {
  await requirePharmacy();
  const t = await getT();

  return (
    <>
      <PageHeader title={t(title)} />
      <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Icon className="size-7" />
        </div>
        <Badge tone="info" className="mt-4">
          <Clock className="mr-1 size-3" />
          {t("modules.comingSoon")}
        </Badge>
        <p className="mt-3 max-w-lg text-sm text-muted-foreground">{t(description)}</p>
        <p className="mt-2 max-w-lg text-xs text-muted-foreground">{t("modules.comingSoonHint")}</p>
        <Link href="/dashboard" className={buttonClass({ variant: "outline", className: "mt-6" })}>
          <House />
          {t("modules.backToDashboard")}
        </Link>
      </div>
    </>
  );
}
