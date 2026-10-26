"use client";

import { CalendarPlus, Infinity as InfinityIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import type { SelectOption } from "@/lib/options";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import type { Pharmacy } from "@/db/schema";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import type { ActionState } from "@/lib/action";
import { clearSubscriptionEnd, extendSubscription, updateSubscription } from "../actions";

type StoredStatus = Pharmacy["subscriptionStatus"];

// Listed here rather than imported from the schema module, which would pull
// the database library into the browser bundle. The Record type keeps it
// complete: a new status in the schema fails type-check until it is added.
const STATUS_LABEL: Record<StoredStatus, MessageKey> = {
  trial: "subscription.statusTrial",
  active: "subscription.statusActive",
  cancelled: "subscription.statusCancelled",
};
const STATUSES = Object.keys(STATUS_LABEL) as StoredStatus[];

/**
 * Plan, status and end date. The page gives this a `key` built from the saved
 * values, so the inputs start again from them after a quick-extend button.
 */
export function SubscriptionForm({
  pharmacyId,
  planId,
  status,
  endDate,
  planOptions,
}: {
  pharmacyId: string;
  planId: string | null;
  status: StoredStatus;
  /** YYYY-MM-DD in the pharmacy's time zone; null = no end date. */
  endDate: string | null;
  planOptions: SelectOption[];
}) {
  const t = useT();
  const { onSubmit, pending, errors } = useFormAction(updateSubscription);

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={pharmacyId} />
      <Field
        label={t("platform.plan")}
        htmlFor="subscription-plan"
        error={errors.planId}
        className="sm:col-span-2"
      >
        <Select id="subscription-plan" name="planId" defaultValue={planId ?? ""}>
          <option value="">{t("platform.noPlan")}</option>
          {planOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={t("platform.subscriptionStatus")}
        htmlFor="subscription-status"
        error={errors.subscriptionStatus}
        required
      >
        <Select
          id="subscription-status"
          name="subscriptionStatus"
          defaultValue={status}
          required
        >
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(STATUS_LABEL[value])}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("platform.endDate")} htmlFor="subscription-end" error={errors.endDate}>
        <Input id="subscription-end" name="endDate" type="date" defaultValue={endDate ?? ""} />
      </Field>
      <p className="text-xs text-muted-foreground sm:col-span-2">{t("platform.endDateHint")}</p>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("common.saveChanges")}
        </Button>
      </div>
    </form>
  );
}

/** "+1 month", "+1 year" and "no end date": each applies immediately. */
export function QuickExtend({
  pharmacyId,
  hasEndDate,
}: {
  pharmacyId: string;
  hasEndDate: boolean;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionState>) {
    startTransition(async () => {
      const result = await action();
      if (result?.ok) {
        if (result.message) toast.success(result.message);
      } else {
        toast.error(result?.message ?? t("common.somethingWrong"));
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run(() => extendSubscription(pharmacyId, "month"))}
      >
        <CalendarPlus />
        {t("platform.extendMonth")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run(() => extendSubscription(pharmacyId, "year"))}
      >
        <CalendarPlus />
        {t("platform.extendYear")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={pending || !hasEndDate}
        onClick={() => run(() => clearSubscriptionEnd(pharmacyId))}
      >
        <InfinityIcon />
        {t("platform.presetNone")}
      </Button>
    </div>
  );
}
