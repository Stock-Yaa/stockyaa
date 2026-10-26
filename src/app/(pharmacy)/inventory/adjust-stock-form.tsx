"use client";

import { Minus, Plus, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useFormat } from "@/components/pharmacy-context";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { adjustStock } from "./actions";
import {
  ADJUSTMENT_DIRECTIONS,
  reasonLabel,
  reasonsFor,
  type AdjustmentDirection,
} from "./reasons";

export type AdjustableBatch = {
  id: string;
  productName: string;
  batchNumber: string | null;
  quantity: number;
  unit: string;
};

const DIRECTION_ICON = { remove: Minus, add: Plus };

/**
 * "Adjust" button for one batch. The user says whether units are being removed
 * or added and how many; the dialog shows the quantity that will result.
 */
export function AdjustStockButton({ batch }: { batch: AdjustableBatch }) {
  const t = useT();
  const f = useFormat();
  // Nothing can be removed from an empty batch, so start on "add" there.
  const initialDirection: AdjustmentDirection = batch.quantity > 0 ? "remove" : "add";
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState(initialDirection);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const close = () => {
    setOpen(false);
    setDirection(initialDirection);
    setAmount("");
    setReason("");
  };
  const { onSubmit, pending, errors } = useFormAction(adjustStock, { onSuccess: close });

  const units = /^\d+$/.test(amount.trim()) ? Number(amount) : 0;
  const after = batch.quantity + (direction === "remove" ? -units : units);
  const directionLabel = {
    remove: t("inventory.removeStock"),
    add: t("inventory.addBack"),
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <SlidersHorizontal />
        {t("inventory.adjust")}
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={t("inventory.adjustTitle")}
        description={`${batch.productName} · ${batch.batchNumber ?? t("inventory.noBatchNumber")}`}
      >
        <form onSubmit={onSubmit} className="grid gap-4">
          <input type="hidden" name="batchId" value={batch.id} />

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">{t("inventory.direction")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {ADJUSTMENT_DIRECTIONS.map((value) => {
                const Icon = DIRECTION_ICON[value];
                return (
                  <label
                    key={value}
                    className={cn(
                      "flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors",
                      "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      direction === value
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-input bg-card text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <input
                      type="radio"
                      name="direction"
                      value={value}
                      checked={direction === value}
                      onChange={() => {
                        setDirection(value);
                        setReason("");
                      }}
                      className="sr-only"
                    />
                    <Icon className="size-4" />
                    {directionLabel[value]}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <Field
            label={
              direction === "remove"
                ? t("inventory.quantityToRemove")
                : t("inventory.quantityToAdd")
            }
            htmlFor="quantity"
            error={errors.quantity}
            required
          >
            <Input
              id="quantity"
              name="quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={direction === "remove" ? batch.quantity : undefined}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
            />
          </Field>

          <dl className="grid grid-cols-2 gap-2 rounded-lg bg-muted px-4 py-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{t("inventory.currentQuantity")}</dt>
              <dd className="font-medium tabular-nums">
                {f.number(batch.quantity)} {batch.unit}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("inventory.quantityAfter")}</dt>
              <dd className={cn("font-medium tabular-nums", after < 0 && "text-destructive")}>
                {f.number(after)} {batch.unit}
              </dd>
            </div>
          </dl>

          <Field label={t("inventory.reason")} htmlFor="reason" error={errors.reason} required>
            <Select
              id="reason"
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            >
              <option value="" disabled>
                {t("inventory.selectReason")}
              </option>
              {reasonsFor(direction).map((value) => (
                <option key={value} value={value}>
                  {reasonLabel(value, t)}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t("inventory.note")}
            htmlFor="note"
            error={errors.note}
            hint={reason === "other" ? t("inventory.noteOtherHint") : undefined}
            required={reason === "other"}
          >
            <Textarea id="note" name="note" maxLength={300} required={reason === "other"} />
          </Field>

          <ModalFooter>
            <Button variant="outline" onClick={close} disabled={pending}>
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
