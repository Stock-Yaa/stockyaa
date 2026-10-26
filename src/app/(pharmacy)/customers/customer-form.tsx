"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import type { Customer } from "@/db/schema";
import { useT } from "@/i18n/client";
import { saveCustomer } from "./actions";

/** "Add customer" button, or a pencil icon when editing, plus the form dialog. */
export function CustomerFormButton({ customer }: { customer?: Customer }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { onSubmit, pending, errors } = useFormAction(saveCustomer, {
    onSuccess: () => setOpen(false),
  });

  return (
    <>
      {customer ? (
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
          {t("customers.add")}
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={customer ? t("customers.edit") : t("customers.add")}
      >
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          {customer && <input type="hidden" name="id" value={customer.id} />}
          <Field
            label={t("common.name")}
            htmlFor="name"
            error={errors.name}
            required
            className="sm:col-span-2"
          >
            <Input id="name" name="name" defaultValue={customer?.name} required autoFocus />
          </Field>
          <Field label={t("common.phone")} htmlFor="phone" error={errors.phone}>
            <Input id="phone" name="phone" type="tel" defaultValue={customer?.phone ?? ""} />
          </Field>
          <Field label={t("common.email")} htmlFor="email" error={errors.email}>
            <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} />
          </Field>
          <Field
            label={t("common.address")}
            htmlFor="address"
            error={errors.address}
            className="sm:col-span-2"
          >
            <Textarea id="address" name="address" defaultValue={customer?.address ?? ""} />
          </Field>
          <Field
            label={t("common.notes")}
            htmlFor="notes"
            error={errors.notes}
            className="sm:col-span-2"
          >
            <Textarea id="notes" name="notes" defaultValue={customer?.notes ?? ""} />
          </Field>
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
