"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { saveReminder } from "./actions";

export type ReminderOption = { id: string; label: string };

export type EditableReminder = {
  id: string;
  customerName: string;
  productName: string;
  intervalDays: number;
  nextDueDate: string;
  isActive: boolean;
  notes: string | null;
};

// A month's supply, the most common refill period.
const DEFAULT_INTERVAL = 30;

/**
 * "Add reminder" button, or a pencil icon when editing, plus the form dialog.
 * A new reminder counts from the last purchase; an existing one has its due
 * date set directly and can be paused.
 */
export function ReminderFormButton({
  reminder,
  customers = [],
  products = [],
  today,
}: {
  reminder?: EditableReminder;
  customers?: ReminderOption[];
  products?: ReminderOption[];
  /** Today in the pharmacy's timezone (YYYY-MM-DD). */
  today: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { onSubmit, pending, errors } = useFormAction(saveReminder, {
    onSuccess: () => setOpen(false),
  });

  return (
    <>
      {reminder ? (
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
          {t("refills.add")}
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={reminder ? t("refills.edit") : t("refills.add")}
        description={
          reminder ? `${reminder.customerName} · ${reminder.productName}` : t("refills.addHint")
        }
      >
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          {reminder ? (
            <input type="hidden" name="id" value={reminder.id} />
          ) : (
            <>
              <Field
                label={t("refills.customer")}
                htmlFor="customerId"
                error={errors.customerId}
                required
                className="sm:col-span-2"
              >
                <Select id="customerId" name="customerId" required defaultValue="" autoFocus>
                  <option value="" disabled>
                    {t("refills.chooseCustomer")}
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t("refills.product")}
                htmlFor="productId"
                error={errors.productId}
                required
                className="sm:col-span-2"
              >
                <Select id="productId" name="productId" required defaultValue="">
                  <option value="" disabled>
                    {t("refills.chooseProduct")}
                  </option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}

          <Field
            label={t("refills.interval")}
            htmlFor="intervalDays"
            error={errors.intervalDays}
            hint={t("refills.intervalHint")}
            required
          >
            <Input
              id="intervalDays"
              name="intervalDays"
              type="number"
              min={1}
              max={365}
              step={1}
              required
              defaultValue={reminder?.intervalDays ?? DEFAULT_INTERVAL}
            />
          </Field>

          {reminder ? (
            <Field
              label={t("refills.nextDue")}
              htmlFor="nextDueDate"
              error={errors.nextDueDate}
              required
            >
              <Input
                id="nextDueDate"
                name="nextDueDate"
                type="date"
                required
                defaultValue={reminder.nextDueDate}
              />
            </Field>
          ) : (
            <Field
              label={t("refills.lastRefill")}
              htmlFor="lastRefillDate"
              error={errors.lastRefillDate}
              hint={t("refills.lastRefillHint")}
            >
              <Input
                id="lastRefillDate"
                name="lastRefillDate"
                type="date"
                max={today}
                defaultValue={today}
              />
            </Field>
          )}

          <Field
            label={t("common.notes")}
            htmlFor="notes"
            error={errors.notes}
            className="sm:col-span-2"
          >
            <Textarea
              id="notes"
              name="notes"
              defaultValue={reminder?.notes ?? ""}
              placeholder={t("refills.notesPlaceholder")}
            />
          </Field>

          {reminder ? (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={reminder.isActive}
                className="size-4 accent-primary"
              />
              {t("refills.activeLabel")}
            </label>
          ) : (
            <input type="hidden" name="isActive" value="true" />
          )}

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
