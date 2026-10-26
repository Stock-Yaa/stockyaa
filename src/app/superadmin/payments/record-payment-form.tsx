"use client";

import { Wallet } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { PERIOD_OPTIONS } from "@/lib/billing-labels";
import { round2 } from "@/lib/utils";
import { recordPayment } from "./actions";

export type PlanPrice = {
  id: string;
  label: string;
  priceMonthly: number;
  priceYearly: number | null;
};

type PaymentTarget = {
  pharmacyId: string;
  plans: PlanPrice[];
  currentPlanId: string | null;
  /** Today in the pharmacy's time zone (YYYY-MM-DD), the latest allowed date. */
  today: string;
};

/** The price of `months` of a plan: the yearly price for 12 months when there is one. */
function suggestedAmount(plan: PlanPrice | undefined, months: number): string {
  if (!plan) return "";
  if (months === 12 && plan.priceYearly !== null) return String(plan.priceYearly);
  return String(round2(plan.priceMonthly * months));
}

/** Mounted only while the dialog is open, so every opening starts fresh. */
function RecordPaymentForm({
  pharmacyId,
  plans,
  currentPlanId,
  today,
  onClose,
}: PaymentTarget & { onClose: () => void }) {
  const t = useT();
  const initialPlan = plans.find((p) => p.id === currentPlanId)?.id ?? "";
  const [planId, setPlanId] = useState(initialPlan);
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState(() =>
    suggestedAmount(plans.find((p) => p.id === initialPlan), 1),
  );
  const { onSubmit, pending, errors } = useFormAction(recordPayment, { onSuccess: onClose });

  function choose(nextPlanId: string, nextMonths: number) {
    setPlanId(nextPlanId);
    setMonths(nextMonths);
    setAmount(suggestedAmount(plans.find((p) => p.id === nextPlanId), nextMonths));
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="pharmacyId" value={pharmacyId} />
      <Field
        label={t("billing.plan")}
        htmlFor="pay-plan"
        error={errors.planId}
        required
        className="sm:col-span-2"
      >
        <Select
          id="pay-plan"
          name="planId"
          value={planId}
          onChange={(e) => choose(e.target.value, months)}
          required
        >
          <option value="" disabled>
            {t("billing.selectPlan")}
          </option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("billing.period")} htmlFor="pay-months" error={errors.months} required>
        <Select
          id="pay-months"
          name="months"
          value={months}
          onChange={(e) => choose(planId, Number(e.target.value))}
        >
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.months} value={option.months}>
              {t(option.label)}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={t("billing.amount")}
        htmlFor="pay-amount"
        error={errors.amount}
        hint={t("billing.amountHint")}
        required
      >
        <Input
          id="pay-amount"
          name="amount"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </Field>
      <Field label={t("billing.method")} htmlFor="pay-method" error={errors.method} required>
        <Select id="pay-method" name="method" defaultValue="cash">
          <option value="cash">{t("billing.methodCash")}</option>
          <option value="transfer">{t("billing.methodTransfer")}</option>
        </Select>
      </Field>
      <Field label={t("billing.paidOn")} htmlFor="pay-date" error={errors.paidOn}>
        <Input id="pay-date" name="paidOn" type="date" defaultValue={today} max={today} />
      </Field>
      <Field
        label={t("billing.reference")}
        htmlFor="pay-reference"
        error={errors.reference}
        hint={t("billing.referenceHint")}
        className="sm:col-span-2"
      >
        <Input id="pay-reference" name="reference" maxLength={100} />
      </Field>
      <Field label={t("common.notes")} htmlFor="pay-note" error={errors.note} className="sm:col-span-2">
        <Textarea id="pay-note" name="note" maxLength={500} />
      </Field>
      <div className="sm:col-span-2">
        <ModalFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? t("common.saving") : t("billing.recordPayment")}
          </Button>
        </ModalFooter>
      </div>
    </form>
  );
}

/** Record-payment dialog for a cash or bank transfer payment, opened by something else. */
export function RecordPaymentDialog({
  open,
  onClose,
  ...target
}: PaymentTarget & { open: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("billing.recordPayment")}
      description={t("billing.recordPaymentDescription")}
    >
      <RecordPaymentForm {...target} onClose={onClose} />
    </Modal>
  );
}

/** "Record payment" button with its dialog. */
export function RecordPaymentButton(target: PaymentTarget) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Wallet />
        {t("billing.recordPayment")}
      </Button>
      <RecordPaymentDialog {...target} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
