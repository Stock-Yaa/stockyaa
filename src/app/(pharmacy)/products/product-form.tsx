"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { usePharmacy } from "@/components/pharmacy-context";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import type { Product } from "@/db/schema";
import { useT } from "@/i18n/client";
import { saveProduct } from "./actions";

export type CategoryOption = { id: string; name: string };

/** "Add product" button, or a pencil icon when editing, plus the form dialog. */
export function ProductFormButton({
  product,
  categories,
}: {
  product?: Product;
  categories: CategoryOption[];
}) {
  const t = useT();
  const { currency, branch } = usePharmacy();
  const [open, setOpen] = useState(false);
  const { onSubmit, pending, errors } = useFormAction(saveProduct, {
    onSuccess: () => setOpen(false),
  });

  return (
    <>
      {product ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("common.edit")}
          onClick={() => setOpen(true)}
        >
          <Pencil />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus />
          {t("products.add")}
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={product ? t("products.edit") : t("products.add")}
        size="lg"
      >
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          {product && <input type="hidden" name="id" value={product.id} />}
          <Field
            label={t("common.name")}
            htmlFor="name"
            error={errors.name}
            required
            className="sm:col-span-2"
          >
            <Input id="name" name="name" defaultValue={product?.name} required autoFocus />
          </Field>
          <Field
            label={t("products.genericName")}
            htmlFor="genericName"
            error={errors.genericName}
          >
            <Input
              id="genericName"
              name="genericName"
              defaultValue={product?.genericName ?? ""}
            />
          </Field>
          <Field label={t("products.category")} htmlFor="categoryId" error={errors.categoryId}>
            <Select
              id="categoryId"
              name="categoryId"
              defaultValue={product?.categoryId ?? ""}
            >
              <option value="">{t("products.noCategory")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("products.dosageForm")}
            htmlFor="dosageForm"
            error={errors.dosageForm}
          >
            <Input
              id="dosageForm"
              name="dosageForm"
              defaultValue={product?.dosageForm ?? ""}
              placeholder={t("products.dosageFormPlaceholder")}
            />
          </Field>
          <Field label={t("products.strength")} htmlFor="strength" error={errors.strength}>
            <Input
              id="strength"
              name="strength"
              defaultValue={product?.strength ?? ""}
              placeholder={t("products.strengthPlaceholder")}
            />
          </Field>
          <Field
            label={t("products.manufacturer")}
            htmlFor="manufacturer"
            error={errors.manufacturer}
          >
            <Input
              id="manufacturer"
              name="manufacturer"
              defaultValue={product?.manufacturer ?? ""}
            />
          </Field>
          <Field label={t("products.barcode")} htmlFor="barcode" error={errors.barcode}>
            <Input id="barcode" name="barcode" defaultValue={product?.barcode ?? ""} />
          </Field>
          <Field
            label={t("products.salePriceWithCurrency", { currency })}
            htmlFor="salePrice"
            error={errors.salePrice}
            required
          >
            <Input
              id="salePrice"
              name="salePrice"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              defaultValue={product?.salePrice}
              required
            />
          </Field>
          <Field
            label={t("products.costPriceWithCurrency", { currency })}
            htmlFor="costPrice"
            error={errors.costPrice}
            hint={t("products.costPriceHint")}
          >
            <Input
              id="costPrice"
              name="costPrice"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              defaultValue={product?.costPrice}
            />
          </Field>
          <Field
            label={t("products.unit")}
            htmlFor="unit"
            error={errors.unit}
            hint={t("products.unitHint")}
          >
            <Input id="unit" name="unit" defaultValue={product?.unit ?? "pcs"} />
          </Field>
          <Field
            label={t("products.reorderLevel")}
            htmlFor="reorderLevel"
            error={errors.reorderLevel}
            hint={t("products.reorderLevelHint")}
          >
            <Input
              id="reorderLevel"
              name="reorderLevel"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              defaultValue={product?.reorderLevel ?? 10}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
            <input
              type="checkbox"
              name="requiresPrescription"
              defaultChecked={product?.requiresPrescription}
              className="size-4 accent-primary"
            />
            {t("products.requiresPrescription")}
          </label>

          {!product && (
            <fieldset className="rounded-lg border border-border p-4 sm:col-span-2">
              <legend className="px-1 text-sm font-medium">
                {t("products.openingStock")}
              </legend>
              <p className="mb-4 text-xs text-muted-foreground">
                {t("products.openingStockHint", { branch: branch.name })}
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  label={t("products.openingQuantity")}
                  htmlFor="openingQuantity"
                  error={errors.openingQuantity}
                >
                  <Input
                    id="openingQuantity"
                    name="openingQuantity"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                  />
                </Field>
                <Field
                  label={t("products.batchNumber")}
                  htmlFor="openingBatchNumber"
                  error={errors.openingBatchNumber}
                >
                  <Input id="openingBatchNumber" name="openingBatchNumber" />
                </Field>
                <Field
                  label={t("products.expiryDate")}
                  htmlFor="openingExpiryDate"
                  error={errors.openingExpiryDate}
                >
                  <Input id="openingExpiryDate" name="openingExpiryDate" type="date" />
                </Field>
              </div>
            </fieldset>
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
