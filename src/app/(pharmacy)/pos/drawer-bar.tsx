import { Lock, LockOpen, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import type { getT } from "@/i18n/server";
import type { DrawerState } from "@/lib/cash-drawer";
import type { Format } from "@/lib/format";
import { now } from "@/lib/time";
import {
  CashDropButton,
  NoSaleButton,
  PayInButton,
  PayOutButton,
  type PayoutCategory,
  type ManagerOption,
} from "../cash-drawer/session-actions";

/**
 * The till's drawer above the POS: whose session it is and the cash actions.
 * What the drawer should hold is never shown here.
 */
export function DrawerBar({
  state,
  managers,
  categories,
  approvalLimit,
  t,
  f,
}: {
  state: DrawerState;
  managers: ManagerOption[];
  categories: PayoutCategory[];
  approvalLimit: number;
  t: Awaited<ReturnType<typeof getT>>;
  f: Format;
}) {
  const { drawer, shift } = state;
  if (!drawer) return null;

  if (!shift || shift.countAttempts.length > 0) {
    const counting = shift !== null;
    return (
      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-warning/40 bg-warning/10 p-3">
        <p className="flex items-center gap-2 text-sm font-medium text-warning">
          <ShieldAlert className="size-4" />
          {counting
            ? t("pos.drawerCounting", { drawer: drawer.name })
            : state.blocked
              ? t("pos.drawerBlocked", { drawer: drawer.name })
              : t("pos.drawerNotOpen", { drawer: drawer.name })}
        </p>
        <Link
          href={counting ? "/cash-drawer?close=1" : "/cash-drawer"}
          className={buttonClass({ size: "sm" })}
        >
          {counting ? <Lock /> : <LockOpen />}
          {counting ? t("pos.finishClosing") : t("pos.openDrawer")}
        </Link>
      </Card>
    );
  }

  const minutes = Math.max(0, Math.floor((now().getTime() - shift.openedAt.getTime()) / 60_000));
  return (
    <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge tone="success">● {t("cashDrawer.sessionOpen")}</Badge>
        <span className="font-semibold">{state.ownerName ?? "—"}</span>
        <span className="text-sm text-muted-foreground">
          {drawer.name} ·{" "}
          {t("cashDrawer.since", {
            time: f.time(shift.openedAt),
            hours: Math.floor(minutes / 60),
            minutes: minutes % 60,
          })}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <PayInButton shiftId={shift.id} compact />
        <PayOutButton
          shiftId={shift.id}
          approvalLimit={approvalLimit}
          managers={managers}
          categories={categories}
          compact
        />
        <CashDropButton shiftId={shift.id} compact />
        <NoSaleButton shiftId={shift.id} compact />
        <Link
          href="/cash-drawer?close=1"
          className={buttonClass({
            size: "sm",
            className: "bg-warning text-warning-foreground hover:bg-warning/90",
          })}
        >
          <Lock />
          {t("cashDrawer.closeShift")}
        </Link>
      </div>
    </Card>
  );
}
