"use client";

import {
  Calculator,
  CalendarClock,
  CalendarX,
  CheckCheck,
  CreditCard,
  Package,
  PackageX,
  RefreshCw,
  Store,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import type { NotificationType } from "@/db/schema";
import { useT } from "@/i18n/client";
import type { ActionState } from "@/lib/action";
import { cn } from "@/lib/utils";
import { markAllNotificationsRead, markNotificationRead, scanNow } from "./actions";

function useActionButton(action: () => Promise<ActionState>) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const run = () =>
    startTransition(async () => {
      const result = await action();
      if (result?.ok) {
        if (result.message) toast.success(result.message);
      } else {
        toast.error(result?.message ?? t("common.somethingWrong"));
      }
    });
  return { pending, run };
}

export function ScanNowButton() {
  const t = useT();
  const { pending, run } = useActionButton(scanNow);
  return (
    <Button variant="outline" onClick={run} disabled={pending}>
      <RefreshCw className={cn(pending && "animate-spin")} />
      {t("notifications.scanNow")}
    </Button>
  );
}

export function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  const t = useT();
  const { pending, run } = useActionButton(markAllNotificationsRead);
  return (
    <Button onClick={run} disabled={disabled || pending}>
      <CheckCheck />
      {t("notifications.markAllRead")}
    </Button>
  );
}

const ICONS: Record<NotificationType, { icon: typeof Package; className: string }> = {
  out_of_stock: { icon: PackageX, className: "text-destructive" },
  low_stock: { icon: Package, className: "text-warning" },
  expired: { icon: CalendarX, className: "text-destructive" },
  expiring: { icon: CalendarClock, className: "text-warning" },
  subscription_ended: { icon: CreditCard, className: "text-destructive" },
  subscription_ending: { icon: CreditCard, className: "text-info" },
  cash_review: { icon: Calculator, className: "text-warning" },
};

/**
 * One notification; opening it marks it read and goes to the related page.
 * `branch` names the branch a stock alert is for, when the reader sees several.
 */
export function NotificationItem({
  id,
  type,
  title,
  body,
  time,
  href,
  unread,
  branch,
}: {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  time: string;
  href: string;
  unread: boolean;
  branch?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { icon: Icon, className } = ICONS[type];

  function open() {
    startTransition(async () => {
      if (unread) await markNotificationRead(id);
      router.push(href);
    });
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={pending}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-70",
        unread
          ? "border-info/30 bg-info/5 hover:bg-info/10"
          : "border-border bg-card hover:bg-muted/50",
      )}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", className)} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("text-sm", unread ? "font-semibold" : "font-medium")}>{title}</span>
          {branch && (
            <Badge tone="muted" title={t("notifications.branch", { name: branch })} className="gap-1">
              <Store className="size-3" aria-hidden />
              <span className="sr-only">{t("notifications.branch", { name: branch })}</span>
              <span aria-hidden>{branch}</span>
            </Badge>
          )}
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{body}</span>
      </span>
      <span className="flex shrink-0 items-center gap-3 text-xs whitespace-nowrap text-muted-foreground">
        {time}
        {unread ? (
          <span className="size-2 rounded-full bg-info" aria-label={t("notifications.unreadDot")} />
        ) : (
          <span className="size-2" aria-hidden />
        )}
      </span>
    </button>
  );
}
