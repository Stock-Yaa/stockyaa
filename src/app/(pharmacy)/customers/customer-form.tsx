"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import type { Customer } from "@/db/schema";
import { useT } from "@/i18n/client";
import { PRICE_LEVEL_LABEL } from "@/lib/price-labels";
import { PRICE_LEVEL_OPTIONS } from "@/lib/pricing";
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
          <Field
            label={t("customers.priceLevel")}
            htmlFor="priceLevel"
            error={errors.priceLevel}
            hint={t("customers.priceLevelHint")}
            className="sm:col-span-2"
          >
            <Select id="priceLevel" name="priceLevel" defaultValue={customer?.priceLevel ?? "regular"}>
              {PRICE_LEVEL_OPTIONS.map((level) => (
                <option key={level} value={level}>
                  {t(PRICE_LEVEL_LABEL[level])}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("common.phone")} htmlFor="phone" error={errors.phone}>
            <Input id="phone" name="phone" type="tel" defaultValue={customer?.phone ?? ""} />
          </Field>
          <Field label={t("common.email")} htmlFor="email" error={errors.email}>
            <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} />
          </Field>
          <Field
            label={t("taxReceipt.customerTaxId")}
            htmlFor="taxId"
            error={errors.taxId}
            hint={t("taxReceipt.customerTaxIdHint")}
          >
            <div className="flex gap-2">
              <Select
                name="taxIdType"
                aria-label={t("taxReceipt.buyerIdType")}
                defaultValue={customer?.taxIdType ?? "tax_id"}
                className="w-36 shrink-0"
              >
                <option value="tax_id">{t("taxReceipt.idTypeTaxId")}</option>
                <option value="passport">{t("taxReceipt.idTypePassport")}</option>
              </Select>
              <Input id="taxId" name="taxId" maxLength={24} defaultValue={customer?.taxId ?? ""} />
            </div>
          </Field>
          <Field
            label={t("taxReceipt.buyerBranch")}
            htmlFor="taxBranch"
            error={errors.taxBranch}
            hint={t("taxReceipt.customerBranchHint")}
          >
            <Input
              id="taxBranch"
              name="taxBranch"
              inputMode="numeric"
              maxLength={5}
              placeholder="00000"
              defaultValue={customer?.taxBranch ?? ""}
            />
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
