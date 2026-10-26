"use client";

import { ArrowDown, Calculator, Lock, Minus, Plus, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useFormat } from "@/components/pharmacy-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import { cn, round2 } from "@/lib/utils";
import { addCashMovement, closeDrawer, openDrawer } from "./actions";

/** Amount typed into a money input, or null while it is blank or not a number. */
function parseAmount(value: string): number | null {
  if (value.trim() === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? round2(amount) : null;
}

/** Shown when no shift is open: count the float into the drawer and start one. */
export function OpenDrawerForm() {
  const t = useT();
  const [balance, setBalance] = useState("");
  const { onSubmit, pending, errors } = useFormAction(openDrawer);

  return (
    <Card className="max-w-xl p-6">
      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Calculator className="size-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{t("cashDrawer.openTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("cashDrawer.openDescription")}</p>
        </div>
      </div>
      <form onSubmit={onSubmit} className="mt-6 grid gap-4">
        <Field
          label={t("cashDrawer.openingBalance")}
          htmlFor="openingBalance"
          error={errors.openingBalance}
          required
        >
          <Input
            id="openingBalance"
            name="openingBalance"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            placeholder="0.00"
            required
            autoFocus
            className="h-12 text-lg tabular-nums"
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="h-12 w-full"
          disabled={pending || parseAmount(balance) === null}
        >
          {pending ? t("cashDrawer.opening") : t("cashDrawer.openButton")}
        </Button>
      </form>
    </Card>
  );
}

const MOVEMENT: Record<
  "in" | "out" | "expense",
  { label: MessageKey; title: MessageKey; hint: MessageKey; icon: LucideIcon; className: string }
> = {
  in: {
    label: "cashDrawer.cashIn",
    title: "cashDrawer.cashInTitle",
    hint: "cashDrawer.cashInHint",
    icon: Plus,
    className: "bg-success text-success-foreground hover:bg-success/90",
  },
  out: {
    label: "cashDrawer.cashOut",
    title: "cashDrawer.cashOutTitle",
    hint: "cashDrawer.cashOutHint",
    icon: Minus,
    className: "bg-warning text-warning-foreground hover:bg-warning/90",
  },
  expense: {
    label: "cashDrawer.expense",
    title: "cashDrawer.expenseTitle",
    hint: "cashDrawer.expenseHint",
    icon: ArrowDown,
    className: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  },
};

/** Cash in, Cash out or Expense button with its dialog. */
export function CashMovementButton({ type }: { type: "in" | "out" | "expense" }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { onSubmit, pending, errors } = useFormAction(addCashMovement, {
    onSuccess: () => setOpen(false),
  });
  const config = MOVEMENT[type];

  return (
    <>
      <Button className={cn("border-transparent", config.className)} onClick={() => setOpen(true)}>
        <config.icon />
        {t(config.label)}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t(config.title)}
        description={t(config.hint)}
        size="sm"
      >
        <form onSubmit={onSubmit} className="grid gap-4">
          <input type="hidden" name="type" value={type} />
          <Field label={t("cashDrawer.amount")} htmlFor="amount" error={errors.amount} required>
            <Input
              id="amount"
              name="amount"
              type="number"
              inputMode="decimal"
              min={0.01}
              step="0.01"
              placeholder="0.00"
              required
              autoFocus
              className="text-right tabular-nums"
            />
          </Field>
          <Field label={t("cashDrawer.reason")} htmlFor="reason" error={errors.reason} required>
            <Input
              id="reason"
              name="reason"
              maxLength={200}
              placeholder={t(
                type === "expense" ? "cashDrawer.expensePlaceholder" : "cashDrawer.reasonPlaceholder",
              )}
              required
            />
          </Field>
          <ModalFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("common.saving") : t("common.save")}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}

/** Close Drawer button: count the cash and see straight away whether it is over or short. */
export function CloseDrawerButton({
  shiftId,
  expectedCash,
}: {
  shiftId: string;
  expectedCash: number;
}) {
  const t = useT();
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const [counted, setCounted] = useState("");
  const { onSubmit, pending, errors } = useFormAction(closeDrawer, {
    onSuccess: () => setOpen(false),
  });
  const countedAmount = parseAmount(counted);
  const difference = countedAmount === null ? null : round2(countedAmount - expectedCash);

  return (
    <>
      <Button
        className="border-transparent bg-foreground text-background hover:bg-foreground/90"
        onClick={() => setOpen(true)}
      >
        <Lock />
        {t("cashDrawer.closeButton")}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("cashDrawer.closeTitle")}
        description={t("cashDrawer.closeHint")}
        size="sm"
      >
        <form onSubmit={onSubmit} className="grid gap-4">
          <input type="hidden" name="shiftId" value={shiftId} />
          <div className="flex items-baseline justify-between rounded-lg bg-muted px-4 py-3 text-sm">
            <span className="text-muted-foreground">{t("cashDrawer.expected")}</span>
            <span className="text-lg font-semibold tabular-nums">{f.money(expectedCash)}</span>
          </div>
          <Field
            label={t("cashDrawer.countedCash")}
            htmlFor="countedCash"
            error={errors.countedCash}
            required
          >
            <Input
              id="countedCash"
              name="countedCash"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              placeholder="0.00"
              required
              autoFocus
              className="h-12 text-right text-lg tabular-nums"
            />
          </Field>
          {difference !== null && (
            <div
              className={cn(
                "flex items-baseline justify-between rounded-lg px-4 py-3 text-sm font-medium",
                difference === 0 && "bg-success/15 text-success",
                difference > 0 && "bg-info/15 text-info",
                difference < 0 && "bg-destructive/15 text-destructive",
              )}
            >
              <span>
                {difference === 0
                  ? t("cashDrawer.balanced")
                  : difference > 0
                    ? t("cashDrawer.over")
                    : t("cashDrawer.short")}
              </span>
              <span className="text-lg font-semibold tabular-nums">
                {difference > 0 ? "+" : ""}
                {f.money(difference)}
              </span>
            </div>
          )}
          <Field label={t("cashDrawer.note")} htmlFor="note" error={errors.note}>
            <Textarea id="note" name="note" rows={2} maxLength={500} />
          </Field>
          <ModalFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={pending || countedAmount === null}>
              <Lock />
              {pending ? t("cashDrawer.closing") : t("cashDrawer.closeButton")}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
