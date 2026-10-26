"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import type { Supplier } from "@/db/schema";
import { useT } from "@/i18n/client";
import { saveSupplier } from "./actions";

/** "Add supplier" button, or a pencil icon when editing, plus the form dialog. */
export function SupplierFormButton({ supplier }: { supplier?: Supplier }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { onSubmit, pending, errors } = useFormAction(saveSupplier, {
    onSuccess: () => setOpen(false),
  });

  return (
    <>
      {supplier ? (
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
          {t("suppliers.add")}
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={supplier ? t("suppliers.edit") : t("suppliers.add")}
      >
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          {supplier && <input type="hidden" name="id" value={supplier.id} />}
          <Field
            label={t("common.name")}
            htmlFor="name"
            error={errors.name}
            required
            className="sm:col-span-2"
          >
            <Input id="name" name="name" defaultValue={supplier?.name} required autoFocus />
          </Field>
          <Field
            label={t("suppliers.contactPerson")}
            htmlFor="contactPerson"
            error={errors.contactPerson}
          >
            <Input
              id="contactPerson"
              name="contactPerson"
              defaultValue={supplier?.contactPerson ?? ""}
            />
          </Field>
          <Field label={t("common.phone")} htmlFor="phone" error={errors.phone}>
            <Input id="phone" name="phone" type="tel" defaultValue={supplier?.phone ?? ""} />
          </Field>
          <Field label={t("common.email")} htmlFor="email" error={errors.email}>
            <Input id="email" name="email" type="email" defaultValue={supplier?.email ?? ""} />
          </Field>
          <Field label={t("suppliers.taxId")} htmlFor="taxId" error={errors.taxId}>
            <Input id="taxId" name="taxId" defaultValue={supplier?.taxId ?? ""} />
          </Field>
          <Field
            label={t("common.address")}
            htmlFor="address"
            error={errors.address}
            className="sm:col-span-2"
          >
            <Textarea id="address" name="address" defaultValue={supplier?.address ?? ""} />
          </Field>
          <Field
            label={t("common.notes")}
            htmlFor="notes"
            error={errors.notes}
            className="sm:col-span-2"
          >
            <Textarea id="notes" name="notes" defaultValue={supplier?.notes ?? ""} />
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
