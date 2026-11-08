"use client";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import { updateCashRules } from "./actions";

type Rules = {
  cashMinorTolerance: number;
  cashMajorTolerance: number;
  payoutApprovalLimit: number;
  cashRecounts: number;
};

const FIELDS: { name: keyof Rules; label: MessageKey; hint: MessageKey; whole?: boolean }[] = [
  { name: "cashMinorTolerance", label: "settings.cashMinorTolerance", hint: "settings.cashMinorToleranceHint" },
  { name: "cashMajorTolerance", label: "settings.cashMajorTolerance", hint: "settings.cashMajorToleranceHint" },
  { name: "payoutApprovalLimit", label: "settings.payoutApprovalLimit", hint: "settings.payoutApprovalLimitHint" },
  { name: "cashRecounts", label: "settings.cashRecounts", hint: "settings.cashRecountsHint", whole: true },
];

/** The pharmacy's cash drawer rules: tolerances, recounts and the pay-out approval limit. */
export function CashRulesForm({ rules }: { rules: Rules }) {
  const t = useT();
  const { onSubmit, pending, errors } = useFormAction(updateCashRules);
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <Field key={field.name} label={t(field.label)} htmlFor={field.name} error={errors[field.name]} hint={t(field.hint)} required>
            <Input
              id={field.name}
              name={field.name}
              type="number"
              inputMode={field.whole ? "numeric" : "decimal"}
              min={0}
              max={field.whole ? 5 : undefined}
              step={field.whole ? 1 : "0.01"}
              defaultValue={rules[field.name]}
              required
              className="tabular-nums"
            />
          </Field>
        ))}
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
