"use client";

import { History, LockOpen, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { usePharmacy } from "@/components/pharmacy-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { openShift, selectDrawer } from "./actions";
import { CashCounter, PinInput, StaffSelect, type StaffOption } from "./cash-inputs";

/** Which drawer this device works with, when the branch has several. */
export function DrawerPicker({
  drawers,
  current,
}: {
  drawers: { id: string; name: string; open: boolean }[];
  current: string;
}) {
  const t = useT();
  const router = useRouter();
  const { branch } = usePharmacy();
  const [pending, startTransition] = useTransition();
  if (drawers.length < 2) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t("cashDrawer.thisDevice")}</span>
      <Select
        value={current}
        disabled={pending}
        className="w-auto min-w-44"
        onChange={(e) => {
          const id = e.target.value;
          startTransition(async () => {
            const result = await selectDrawer(id, branch.id);
            if (result && !result.ok && result.message) toast.error(result.message);
            router.refresh();
          });
        }}
      >
        {drawers.map((d) => (
          <option key={d.id} value={d.id}>
            {d.open ? t("cashDrawer.drawerOpenOption", { name: d.name }) : d.name}
          </option>
        ))}
      </Select>
    </label>
  );
}

export type PreviousSession = {
  closedBy: string | null;
  closedAt: string;
  review: "pending" | "approved" | "rejected" | null;
};

/**
 * Starting a session: name and PIN on the left, a blind count of the float
 * on the right. The amount the drawer should hold is never shown.
 */
export function OpenShiftForm({
  drawer,
  staff,
  defaultUserId,
  previous,
  handoverFrom,
}: {
  drawer: { id: string; name: string };
  staff: StaffOption[];
  defaultUserId?: string;
  previous: PreviousSession | null;
  handoverFrom: string | null;
}) {
  const t = useT();
  const [total, setTotal] = useState(0);
  const { onSubmit, pending, errors } = useFormAction(openShift);
  const noPins = !staff.some((s) => s.hasPin);

  return (
    <form onSubmit={onSubmit} className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <input type="hidden" name="drawerId" value={drawer.id} />
      <Card className="grid gap-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">
            {handoverFrom ? t("cashDrawer.handoverTitle") : t("cashDrawer.openTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {handoverFrom
              ? t("cashDrawer.handoverHint", { name: handoverFrom })
              : t("cashDrawer.openHint", { drawer: drawer.name })}
          </p>
        </div>
        {noPins && (
          <p className="flex gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            {t("cashDrawer.noPinsYet")}
          </p>
        )}
        <StaffSelect
          staff={staff}
          defaultValue={defaultUserId}
          label={t("cashDrawer.staff")}
          error={errors.userId}
        />
        <PinInput label={t("cashDrawer.pin")} error={errors.pin} />
        {previous && (
          <p className="flex gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <History className="mt-0.5 size-4 shrink-0" />
            <span>
              {t("cashDrawer.lastSession", {
                name: previous.closedBy ?? "—",
                date: previous.closedAt,
              })}
              {previous.review && ` · ${t(`cashDrawer.review_${previous.review}`)}`}
            </span>
          </p>
        )}
        {handoverFrom && (
          <p className="rounded-lg bg-info/15 px-3 py-2 text-sm text-info">
            {t("cashDrawer.handoverRule")}
          </p>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">{t("cashDrawer.countFloat")}</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">{t("cashDrawer.countFloatHint")}</p>
        <CashCounter totalLabel={t("cashDrawer.countedFloat")} error={errors.counts} onTotal={setTotal} />
        <Button type="submit" size="lg" className="mt-4 w-full" disabled={pending || noPins}>
          <LockOpen />
          {pending ? t("cashDrawer.opening") : t("cashDrawer.confirmOpen")}
        </Button>
        {total === 0 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">{t("cashDrawer.emptyFloatHint")}</p>
        )}
      </Card>
    </form>
  );
}
