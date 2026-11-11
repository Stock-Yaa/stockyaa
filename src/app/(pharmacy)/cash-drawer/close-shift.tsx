"use client";

import { Lock, RotateCcw, ShieldAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { unstable_rethrow, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useFormat, usePharmacy } from "@/components/pharmacy-context";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import { ACTIVE_BRANCH_FIELD } from "@/lib/active-branch";
import type { VarianceLevel } from "@/lib/cash-rules";
import { cn, round2 } from "@/lib/utils";
import { finishClose, submitCount, type CountResult } from "./actions";
import { CashCounter, PinInput, StaffSelect, type StaffOption } from "./cash-inputs";

export type CountOutcome = Extract<CountResult, { ok: true }>;

const LEVEL: Record<VarianceLevel, { box: string; message: MessageKey }> = {
  balanced: { box: "bg-success/15 text-success", message: "cashDrawer.resultBalanced" },
  minor: { box: "bg-success/15 text-success", message: "cashDrawer.resultMinor" },
  major: { box: "bg-warning/15 text-warning", message: "cashDrawer.resultMajor" },
  severe: { box: "bg-destructive/15 text-destructive", message: "cashDrawer.resultSevere" },
};

/**
 * Closing a session. Step 1 is the count, with the counter's PIN, next to
 * what the drawer should hold. Step 2 shows the
 * result, offers a recount when the rules allow, asks for a reason when it is
 * out, and what to take to the safe; then the session closes.
 */
export function CloseShiftPanel({
  shiftId,
  staff,
  ownerId,
  expected,
  initial,
}: {
  shiftId: string;
  staff: StaffOption[];
  ownerId: string | null;
  /** What the drawer should hold. */
  expected: number;
  /** The last count, when counting started earlier (page reloaded). */
  initial: CountOutcome | null;
}) {
  const t = useT();
  const f = useFormat();
  const { branch } = usePharmacy();
  const [result, setResult] = useState<CountOutcome | null>(initial);
  const [recounting, setRecounting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function onCount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set(ACTIVE_BRANCH_FIELD, branch.id);
    startTransition(async () => {
      try {
        const outcome = await submitCount(formData);
        if (outcome.ok) {
          setResult(outcome);
          setRecounting(false);
          setErrors({});
        } else {
          setErrors(outcome.fieldErrors ?? {});
          if (outcome.message) toast.error(outcome.message);
        }
      } catch (error) {
        unstable_rethrow(error);
        toast.error(t("common.somethingWrong"));
      }
    });
  }

  if (!result || recounting) {
    return (
      <form onSubmit={onCount} className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <input type="hidden" name="shiftId" value={shiftId} />
        <Card className="p-5">
          <h2 className="text-lg font-semibold">
            {recounting ? t("cashDrawer.recountTitle") : t("cashDrawer.closeTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("cashDrawer.closeHint")}</p>
          <p className="mt-3 mb-4 flex gap-2 rounded-lg bg-info/15 px-3 py-2 text-sm text-info">
            <Wallet className="mt-0.5 size-4 shrink-0" />
            {t("cashDrawer.expectedNow", { amount: f.money(expected) })}
          </p>
          <CashCounter totalLabel={t("cashDrawer.counted")} error={errors.counts} />
        </Card>
        <Card className="grid gap-4 p-5">
          <StaffSelect
            staff={staff}
            defaultValue={ownerId ?? undefined}
            label={t("cashDrawer.countedBy")}
            error={errors.userId}
          />
          <PinInput label={t("cashDrawer.pin")} error={errors.pin} />
          <div className="flex flex-wrap gap-2">
            {recounting ? (
              <Button variant="outline" onClick={() => setRecounting(false)} disabled={pending}>
                {t("common.back")}
              </Button>
            ) : (
              <Link href="/cash-drawer" className={buttonClass({ variant: "outline" })}>
                {t("common.cancel")}
              </Link>
            )}
            <Button type="submit" className="flex-1" disabled={pending}>
              {pending ? t("cashDrawer.submitting") : t("cashDrawer.submitCount")}
            </Button>
          </div>
        </Card>
      </form>
    );
  }

  return (
    <CountResultPanel
      shiftId={shiftId}
      result={result}
      onRecount={() => setRecounting(true)}
    />
  );
}

function CountResultPanel({
  shiftId,
  result,
  onRecount,
}: {
  shiftId: string;
  result: CountOutcome;
  onRecount: () => void;
}) {
  const t = useT();
  const f = useFormat();
  const router = useRouter();
  const level = LEVEL[result.level];
  const out = result.level !== "balanced";
  const toReview = result.level === "major" || result.level === "severe";
  const [drop, setDrop] = useState("0");
  const { onSubmit, pending, errors } = useFormAction(finishClose, {
    onSuccess: () => router.push(`/cash-drawer/${shiftId}?closed=1`),
  });
  // `|| 0` turns -0 (e.g. no refunds) into 0, which formats without a minus sign.
  const signed = (value: number) => `${value > 0 ? "+" : ""}${f.money(value || 0)}`;
  const { totals } = result;
  const lines: [MessageKey, number][] = [
    ["cashDrawer.openingFloat", result.openingBalance],
    ["cashDrawer.cashSales", totals.cashSales],
    ["cashDrawer.cashRefunds", -totals.cashRefunds],
    ["cashDrawer.payIns", totals.payIns],
    ["cashDrawer.payOuts", -(totals.payOuts + totals.expenses)],
    ["cashDrawer.drops", -totals.drops],
  ];
  const dropValue = Number(drop) || 0;

  return (
    <Card className="mx-auto max-w-2xl p-5">
      <div className={cn("rounded-xl px-4 py-5 text-center", level.box)}>
        <p className="font-medium">
          {result.level === "balanced"
            ? t("cashDrawer.balanced")
            : result.difference < 0
              ? t("cashDrawer.short")
              : t("cashDrawer.over")}
        </p>
        <p className="my-1 text-4xl font-bold tabular-nums">{signed(result.difference)}</p>
        <p className="text-sm">{t(level.message)}</p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {(
          [
            ["cashDrawer.expected", f.money(result.expected)],
            ["cashDrawer.counted", f.money(result.counted)],
            ["cashDrawer.difference", signed(result.difference)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border p-3">
            <p className="text-lg font-semibold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{t(label)}</p>
          </div>
        ))}
      </div>

      <dl className="mt-4 divide-y divide-border text-sm">
        {lines.map(([label, value]) => (
          <div key={label} className="flex justify-between py-2">
            <dt className="text-muted-foreground">{t(label)}</dt>
            <dd className="tabular-nums">{signed(value)}</dd>
          </div>
        ))}
        <div className="flex justify-between py-2 font-semibold">
          <dt>{t("cashDrawer.expected")}</dt>
          <dd className="tabular-nums">{f.money(result.expected)}</dd>
        </div>
      </dl>

      <form onSubmit={onSubmit} className="mt-4 grid gap-4">
        <input type="hidden" name="shiftId" value={shiftId} />
        {out && (
          <Field label={t("cashDrawer.reason")} htmlFor="reason" error={errors.reason} required>
            <Textarea
              id="reason"
              name="reason"
              rows={2}
              maxLength={500}
              placeholder={t("cashDrawer.reasonExample")}
              required
            />
          </Field>
        )}
        <div className="grid gap-3 rounded-lg bg-muted/60 p-3 sm:grid-cols-2">
          <Field
            label={t("cashDrawer.closingDrop")}
            htmlFor="closingDrop"
            error={errors.closingDrop}
            hint={t("cashDrawer.closingDropHint", {
              left: f.money(Math.max(0, round2(result.counted - dropValue))),
            })}
          >
            <Input
              id="closingDrop"
              name="closingDrop"
              type="number"
              inputMode="decimal"
              min={0}
              max={result.counted}
              step="0.01"
              value={drop}
              onChange={(e) => setDrop(e.target.value)}
              className="text-right tabular-nums"
            />
          </Field>
          <Field
            label={t("cashDrawer.bagNumber")}
            htmlFor="closingBag"
            error={errors.closingBag}
            required={dropValue > 0}
          >
            <Input id="closingBag" name="closingBag" maxLength={50} required={dropValue > 0} />
          </Field>
        </div>
        {toReview && (
          <p className="flex gap-2 text-sm text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            {t(result.level === "severe" ? "cashDrawer.willBlock" : "cashDrawer.willReview")}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {result.canRecount && (
            <Button variant="outline" onClick={onRecount} disabled={pending}>
              <RotateCcw />
              {t("cashDrawer.recount", { count: result.recountsLeft })}
            </Button>
          )}
          <Button type="submit" disabled={pending}>
            <Lock />
            {pending
              ? t("cashDrawer.closing")
              : toReview
                ? t("cashDrawer.sendToManager")
                : t("cashDrawer.closeAndPrint")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
