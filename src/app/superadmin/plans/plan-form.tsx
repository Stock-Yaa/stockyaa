"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import type { SelectOption } from "@/lib/options";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import { PLAN_TYPES, type Plan } from "@/db/schema";
import { useT } from "@/i18n/client";
import { PLAN_TYPE_LABEL } from "@/lib/billing-labels";
import { savePlan } from "./actions";

/** "Add plan" button, or a pencil icon when editing, plus the form dialog. */
export function PlanFormButton({
  plan,
  currencyOptions,
  nextSortOrder = 0,
}: {
  plan?: Plan;
  currencyOptions: SelectOption[];
  /** Sort order suggested for a new plan, so it lands after the existing ones. */
  nextSortOrder?: number;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<Plan["type"]>(plan?.type ?? "standard");
  const { onSubmit, pending, errors } = useFormAction(savePlan, {
    onSuccess: () => setOpen(false),
  });

  return (
    <>
      {plan ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("common.edit")}
          title={t("common.edit")}
          onClick={() => setOpen(true)}
        >
          <Pencil />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus />
          {t("platform.addPlan")}
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={plan ? t("platform.editPlan") : t("platform.addPlan")}
      >
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          {plan && <input type="hidden" name="id" value={plan.id} />}
          <Field
            label={t("common.name")}
            htmlFor="plan-name"
            error={errors.name}
            required
            className="sm:col-span-2"
          >
            <Input
              id="plan-name"
              name="name"
              defaultValue={plan?.name}
              maxLength={100}
              required
              autoFocus
            />
          </Field>
          <Field
            label={t("platform.planDescription")}
            htmlFor="plan-description"
            error={errors.description}
            className="sm:col-span-2"
          >
            <Textarea
              id="plan-description"
              name="description"
              maxLength={500}
              defaultValue={plan?.description ?? ""}
            />
          </Field>
          <Field
            label={t("platform.priceMonthly")}
            htmlFor="plan-price"
            error={errors.priceMonthly}
            required
          >
            <Input
              id="plan-price"
              name="priceMonthly"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              defaultValue={plan?.priceMonthly ?? ""}
              required
            />
          </Field>
          <Field
            label={t("billing.priceYearly")}
            htmlFor="plan-price-yearly"
            error={errors.priceYearly}
            hint={t("billing.priceYearlyHint")}
          >
            <Input
              id="plan-price-yearly"
              name="priceYearly"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              defaultValue={plan?.priceYearly ?? ""}
            />
          </Field>
          <Field
            label={t("platform.currency")}
            htmlFor="plan-currency"
            error={errors.currency}
            required
          >
            <Select
              id="plan-currency"
              name="currency"
              defaultValue={plan?.currency ?? "THB"}
              required
            >
              {currencyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("platform.planType")}
            htmlFor="plan-type"
            error={errors.type}
            hint={t("platform.planTypeHint")}
            required
            className="sm:col-span-2"
          >
            <Select
              id="plan-type"
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value as Plan["type"])}
              required
            >
              {PLAN_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(PLAN_TYPE_LABEL[value])}
                </option>
              ))}
            </Select>
          </Field>
          {type === "multi_branch" && (
            <Field
              label={t("platform.maxBranches")}
              htmlFor="plan-branches"
              error={errors.maxBranches}
              hint={t("platform.maxBranchesHint")}
              required
            >
              <Input
                id="plan-branches"
                name="maxBranches"
                type="number"
                inputMode="numeric"
                min={2}
                max={1000}
                step={1}
                defaultValue={Math.max(plan?.maxBranches ?? 2, 2)}
                required
              />
            </Field>
          )}
          <Field
            label={t("platform.sortOrder")}
            htmlFor="plan-sort"
            error={errors.sortOrder}
            hint={t("platform.sortOrderHint")}
            required
          >
            <Input
              id="plan-sort"
              name="sortOrder"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              defaultValue={plan?.sortOrder ?? nextSortOrder}
              required
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm font-medium sm:mt-7">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={plan?.isActive ?? true}
                className="size-4 accent-primary"
              />
              {t("platform.planActive")}
            </label>
            <p className="text-xs text-muted-foreground">{t("platform.planActiveHint")}</p>
          </div>
          <div className="sm:col-span-2">
            <ModalFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? t("common.saving") : t("common.save")}
              </Button>
            </ModalFooter>
          </div>
        </form>
      </Modal>
    </>
  );
}
