import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { Pharmacy } from "@/db/schema";
import { getT } from "@/i18n/server";
import { hasAccess } from "@/lib/auth";
import { getFormat } from "@/lib/format-server";
import { daysUntil } from "@/lib/time";

const WARN_DAYS = 7;

/** Notice under the top bar when access is blocked or the subscription ends soon. */
export async function SubscriptionBanner({ pharmacy }: { pharmacy: Pharmacy }) {
  const t = await getT();
  const f = await getFormat(pharmacy);

  let message: string | null = null;
  let blocked = false;
  if (!hasAccess(pharmacy)) {
    blocked = true;
    message =
      pharmacy.status === "suspended"
        ? t("subscription.bannerSuspended")
        : t("subscription.bannerExpired");
  } else if (pharmacy.subscriptionEndsAt) {
    if (daysUntil(pharmacy.subscriptionEndsAt) <= WARN_DAYS) {
      message = t("subscription.bannerEndingSoon", {
        date: f.date(pharmacy.subscriptionEndsAt),
      });
    }
  }
  if (!message) return null;

  return (
    <div
      className={
        blocked
          ? "flex items-center gap-2 bg-destructive/15 px-4 py-2 text-sm text-destructive sm:px-6 print:hidden"
          : "flex items-center gap-2 bg-warning/15 px-4 py-2 text-sm text-warning sm:px-6 print:hidden"
      }
    >
      <TriangleAlert className="size-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <Link href="/subscription" className="font-medium underline underline-offset-2">
        {t("subscription.bannerLink")}
      </Link>
    </div>
  );
}
