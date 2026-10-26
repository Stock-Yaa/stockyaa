"use client";

import { PackagePlus } from "lucide-react";
import { useState } from "react";
import { usePharmacy } from "@/components/pharmacy-context";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { addStock } from "./actions";

export type StockProductOption = {
  id: string;
  name: string;
  strength: string | null;
  unit: string;
  costPrice: number;
};

/** "Add stock" button plus the dialog that records a new batch. */
export function AddStockButton({ products }: { products: StockProductOption[] }) {
  const t = useT();
  const { currency } = usePharmacy();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const close = () => {
    setOpen(false);
    setProductId("");
  };
  const { onSubmit, pending, errors } = useFormAction(addStock, { onSuccess: close });
  const selected = products.find((p) => p.id === productId);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PackagePlus />
        {t("inventory.addStock")}
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={t("inventory.addStock")}
        description={t("inventory.addStockHint")}
      >
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("inventory.product")}
            htmlFor="productId"
            error={errors.productId}
            required
            className="sm:col-span-2"
          >
            <Select
              id="productId"
              name="productId"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
              autoFocus
            >
              <option value="" disabled>
                {t("inventory.selectProduct")}
              </option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.strength ? `${product.name} (${product.strength})` : product.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("common.quantity")}
            htmlFor="quantity"
            error={errors.quantity}
            hint={selected ? t("inventory.countedIn", { unit: selected.unit }) : undefined}
            required
          >
            <Input
              id="quantity"
              name="quantity"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
            />
          </Field>
          <Field
            label={t("inventory.costPriceWithCurrency", { currency })}
            htmlFor="costPrice"
            error={errors.costPrice}
            hint={t("inventory.costPriceHint")}
          >
            {/* Keyed by product so choosing one pre-fills its usual cost. */}
            <Input
              key={productId}
              id="costPrice"
              name="costPrice"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              defaultValue={selected?.costPrice}
            />
          </Field>
          <Field
            label={t("inventory.batchNumber")}
            htmlFor="batchNumber"
            error={errors.batchNumber}
          >
            <Input id="batchNumber" name="batchNumber" />
          </Field>
          <Field label={t("inventory.expiryDate")} htmlFor="expiryDate" error={errors.expiryDate}>
            <Input id="expiryDate" name="expiryDate" type="date" />
          </Field>
          <Field
            label={t("inventory.note")}
            htmlFor="note"
            error={errors.note}
            className="sm:col-span-2"
          >
            <Textarea id="note" name="note" maxLength={300} />
          </Field>
          <div className="sm:col-span-2">
            <ModalFooter>
              <Button variant="outline" onClick={close} disabled={pending}>
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
