"use client";

import { Camera, CircleCheck, DoorOpen, Minus, PackageCheck, Plus, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useFormat } from "@/components/pharmacy-context";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import type { PAY_IN_CATEGORIES as PayIn } from "@/db/schema";
import { useT } from "@/i18n/client";
import { shrinkPhoto } from "@/lib/shrink-photo";
import { cn } from "@/lib/utils";
import { addCashDrop, addPayIn, addPayOut, recordNoSale } from "./actions";
import { CashCounter, PinInput } from "./cash-inputs";

/*
 * What can happen to an open drawer besides sales: pay-in, pay-out, cash
 * drop and no-sale. Used on the cash drawer page and in the POS drawer bar.
 * Each form lives in its dialog, which unmounts it on close.
 */

// The schema's lists, without bundling the schema into the browser.
const PAY_IN_CATEGORIES = ["float_topup", "other"] as const satisfies typeof PayIn;

function Footer({ pending, onCancel, label }: { pending: boolean; onCancel: () => void; label: string }) {
  const t = useT();
  return (
    <ModalFooter>
      <Button variant="outline" onClick={onCancel} disabled={pending}>
        {t("common.cancel")}
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? t("common.saving") : label}
      </Button>
    </ModalFooter>
  );
}

function AmountField({
  error,
  onChange,
}: {
  error?: string;
  onChange?: (value: number) => void;
}) {
  const t = useT();
  return (
    <Field label={t("cashDrawer.amount")} htmlFor="amount" error={error} required>
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
        onChange={(e) => onChange?.(Number(e.target.value) || 0)}
        className="h-11 text-right text-lg tabular-nums"
      />
    </Field>
  );
}

export function PayInButton({ shiftId, compact }: { shiftId: string; compact?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<(typeof PAY_IN_CATEGORIES)[number]>("float_topup");
  const { onSubmit, pending, errors } = useFormAction(addPayIn, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button variant="outline" size={compact ? "sm" : "md"} onClick={() => setOpen(true)}>
        <Plus />
        {t("cashDrawer.payIn")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("cashDrawer.payIn")} description={t("cashDrawer.payInHint")} size="sm">
        <form onSubmit={onSubmit} className="grid gap-4">
          <input type="hidden" name="shiftId" value={shiftId} />
          <Field label={t("cashDrawer.type")} htmlFor="category" error={errors.category} required>
            <Select
              id="category"
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
            >
              {PAY_IN_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`cashDrawer.payIn_${c}`)}
                </option>
              ))}
            </Select>
          </Field>
          <AmountField error={errors.amount} />
          <Field label={t("cashDrawer.note")} htmlFor="note" error={errors.note} required={category === "other"}>
            <Textarea id="note" name="note" rows={2} maxLength={200} placeholder={t("cashDrawer.notePlaceholder")} />
          </Field>
          <Footer pending={pending} onCancel={() => setOpen(false)} label={t("cashDrawer.savePayIn")} />
        </form>
      </Modal>
    </>
  );
}

export type ManagerOption = { id: string; name: string; hasPin: boolean };

/** An expense category a pay-out can be booked under. */
export type PayoutCategory = { id: string; name: string };

export function PayOutButton({
  shiftId,
  approvalLimit,
  managers,
  categories,
  compact,
}: {
  shiftId: string;
  approvalLimit: number;
  managers: ManagerOption[];
  /** The pharmacy's expense categories: a pay-out is also an expense. */
  categories: PayoutCategory[];
  compact?: boolean;
}) {
  const t = useT();
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [askManager, setAskManager] = useState(true);
  const close = () => {
    setOpen(false);
    setPhoto(null);
    setAmount(0);
    setAskManager(true);
  };
  const { onSubmit, pending, errors } = useFormAction(
    async (formData) => {
      if (photo) formData.set("receipt", photo, photo.name);
      return addPayOut(formData);
    },
    { onSuccess: close },
  );
  const overLimit = amount > approvalLimit;
  const withPin = managers.filter((m) => m.hasPin);

  return (
    <>
      <Button variant="outline" size={compact ? "sm" : "md"} onClick={() => setOpen(true)}>
        <Minus />
        {t("cashDrawer.payOut")}
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={t("cashDrawer.payOut")}
        description={t("cashDrawer.payOutHint", { limit: f.money(approvalLimit) })}
        size="sm"
      >
        <form onSubmit={onSubmit} className="grid gap-4">
          <input type="hidden" name="shiftId" value={shiftId} />
          <Field
            label={t("cashDrawer.category")}
            htmlFor="categoryId"
            error={errors.categoryId}
            hint={t("cashDrawer.payOutCategoryHint")}
            required
          >
            <Select id="categoryId" name="categoryId" defaultValue={categories[0]?.id} required>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <AmountField error={errors.amount} onChange={setAmount} />
          <Field label={t("cashDrawer.receiptPhoto")} htmlFor="receipt" error={errors.receipt} required>
            <label
              htmlFor="receipt"
              className={cn(
                "flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-sm",
                photo ? "border-success bg-success/15 text-success" : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {photo ? <CircleCheck className="size-5" /> : <Camera className="size-5" />}
              {reading
                ? t("cashDrawer.photoReading")
                : photo
                  ? t("cashDrawer.photoAttached")
                  : t("cashDrawer.takePhoto")}
            </label>
            {/* No name: the shrunk copy is what gets sent. */}
            <input
              id="receipt"
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setReading(true);
                setPhoto(await shrinkPhoto(file, "receipt.jpg"));
                setReading(false);
              }}
            />
          </Field>
          <Field label={t("cashDrawer.note")} htmlFor="note" error={errors.note} required>
            <Textarea id="note" name="note" rows={2} maxLength={200} placeholder={t("cashDrawer.payOutNotePlaceholder")} required />
          </Field>

          {overLimit && (
            <div className="grid gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
              <p className="flex gap-2 text-sm text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {t("cashDrawer.overLimit", { limit: f.money(approvalLimit) })}
              </p>
              <div className="flex gap-2 text-sm">
                <Button size="sm" variant={askManager ? "primary" : "outline"} onClick={() => setAskManager(true)}>
                  {t("cashDrawer.managerHere")}
                </Button>
                <Button size="sm" variant={askManager ? "outline" : "primary"} onClick={() => setAskManager(false)}>
                  {t("cashDrawer.sendForApproval")}
                </Button>
              </div>
              {askManager ? (
                <>
                  <Field label={t("cashDrawer.manager")} htmlFor="managerId" required>
                    <Select id="managerId" name="managerId" defaultValue={withPin[0]?.id ?? ""} required>
                      {withPin.length === 0 && <option value="">{t("cashDrawer.noManagerPins")}</option>}
                      {withPin.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <PinInput name="managerPin" id="managerPin" label={t("cashDrawer.managerPin")} error={errors.managerPin} />
                </>
              ) : (
                <>
                  <input type="hidden" name="requestApproval" value="on" />
                  <p className="text-sm text-muted-foreground">{t("cashDrawer.sendForApprovalHint")}</p>
                  {errors.managerPin && <p className="text-xs text-destructive">{errors.managerPin}</p>}
                </>
              )}
            </div>
          )}
          <Footer pending={pending || reading} onCancel={close} label={t("cashDrawer.savePayOut")} />
        </form>
      </Modal>
    </>
  );
}

export function CashDropButton({ shiftId, compact }: { shiftId: string; compact?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { onSubmit, pending, errors } = useFormAction(addCashDrop, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button variant="outline" size={compact ? "sm" : "md"} onClick={() => setOpen(true)}>
        <PackageCheck />
        {t("cashDrawer.cashDrop")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("cashDrawer.cashDropTitle")} description={t("cashDrawer.cashDropHint")} size="lg">
        <form onSubmit={onSubmit} className="grid gap-4">
          <input type="hidden" name="shiftId" value={shiftId} />
          <CashCounter notesOnly totalLabel={t("cashDrawer.dropTotal")} error={errors.counts} />
          <Field label={t("cashDrawer.bagNumber")} htmlFor="bagNumber" error={errors.bagNumber} required>
            <Input id="bagNumber" name="bagNumber" maxLength={50} required />
          </Field>
          <Footer pending={pending} onCancel={() => setOpen(false)} label={t("cashDrawer.confirmDrop")} />
        </form>
      </Modal>
    </>
  );
}

export function NoSaleButton({ shiftId, compact }: { shiftId: string; compact?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { onSubmit, pending, errors } = useFormAction(recordNoSale, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button variant="outline" size={compact ? "sm" : "md"} onClick={() => setOpen(true)}>
        <DoorOpen />
        {t("cashDrawer.noSale")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("cashDrawer.noSale")} description={t("cashDrawer.noSaleHint")} size="sm">
        <form onSubmit={onSubmit} className="grid gap-4">
          <input type="hidden" name="shiftId" value={shiftId} />
          <Field label={t("cashDrawer.reason")} htmlFor="reason" error={errors.reason} required>
            <Input id="reason" name="reason" maxLength={200} placeholder={t("cashDrawer.noSalePlaceholder")} required autoFocus />
          </Field>
          <Footer pending={pending} onCancel={() => setOpen(false)} label={t("common.save")} />
        </form>
      </Modal>
    </>
  );
}
