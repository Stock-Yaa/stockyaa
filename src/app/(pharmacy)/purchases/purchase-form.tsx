"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { useFormat } from "@/components/pharmacy-context";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { round2 } from "@/lib/utils";
import { createPurchase } from "./actions";

type SupplierOption = { id: string; name: string };
type ProductOption = {
  id: string;
  name: string;
  strength: string | null;
  unit: string;
  costPrice: number;
};

/** One row of the order. Inputs are kept as typed; the server parses them. */
type Line = {
  /** Stable React key; never sent to the server. */
  key: number;
  productId: string;
  quantity: string;
  costPrice: string;
  batchNumber: string;
  expiryDate: string;
};
type LineField = Exclude<keyof Line, "key">;

const emptyLine = (key: number): Line => ({
  key,
  productId: "",
  quantity: "",
  costPrice: "",
  batchNumber: "",
  expiryDate: "",
});

function lineAmount(line: Line): number {
  const amount = Number(line.quantity) * Number(line.costPrice);
  return Number.isFinite(amount) ? amount : 0;
}

/** New purchase form: order details, line items and the two save buttons. */
export function PurchaseForm({
  suppliers,
  products,
}: {
  suppliers: SupplierOption[];
  products: ProductOption[];
}) {
  const t = useT();
  const f = useFormat();
  const [lines, setLines] = useState<Line[]>([emptyLine(0)]);
  // Line keys in the order they were last submitted: the server reports item
  // errors by position ("items.2.quantity"), and rows may move afterwards.
  const [submittedKeys, setSubmittedKeys] = useState<number[]>([]);
  const receiveNowRef = useRef<HTMLInputElement>(null);
  const { onSubmit, pending, errors } = useFormAction(createPurchase);

  const total = round2(lines.reduce((sum, line) => sum + lineAmount(line), 0));
  const items = JSON.stringify(
    lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      costPrice: line.costPrice,
      batchNumber: line.batchNumber,
      expiryDate: line.expiryDate,
    })),
  );

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function selectProduct(key: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    // Pre-fill the cost with the product's default; it can still be edited.
    updateLine(key, { productId, costPrice: product ? String(product.costPrice) : "" });
  }

  function addLine() {
    setLines((current) => [
      ...current,
      emptyLine(Math.max(...current.map((line) => line.key)) + 1),
    ]);
  }

  function removeLine(key: number) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  function lineError(line: Line, field: LineField): string | undefined {
    const index = submittedKeys.indexOf(line.key);
    return index === -1 ? undefined : errors[`items.${index}.${field}`];
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const { nativeEvent } = event;
    const submitter = nativeEvent instanceof SubmitEvent ? nativeEvent.submitter : null;
    if (receiveNowRef.current) {
      receiveNowRef.current.value = String(
        submitter instanceof HTMLButtonElement && submitter.value === "receive",
      );
    }
    setSubmittedKeys(lines.map((line) => line.key));
    onSubmit(event);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="items" value={items} />
      <input ref={receiveNowRef} type="hidden" name="receiveNow" defaultValue="false" />

      <Card>
        <CardHeader>
          <CardTitle>{t("purchases.details")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("purchases.supplier")}
            htmlFor="supplierId"
            error={errors.supplierId}
          >
            <Select id="supplierId" name="supplierId" defaultValue="">
              <option value="">{t("purchases.noSupplier")}</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("purchases.supplierInvoice")}
            htmlFor="supplierInvoice"
            error={errors.supplierInvoice}
          >
            <Input id="supplierInvoice" name="supplierInvoice" maxLength={100} />
          </Field>
          <Field
            label={t("common.notes")}
            htmlFor="notes"
            error={errors.notes}
            className="sm:col-span-2"
          >
            <Textarea id="notes" name="notes" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("purchases.items")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {errors.items && (
            <p role="alert" className="text-sm text-destructive">
              {errors.items}
            </p>
          )}

          {lines.map((line) => (
            <div
              key={line.key}
              className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_5.5rem_7rem_8rem_9.5rem_auto]"
            >
              <Field
                label={t("purchases.product")}
                htmlFor={`product-${line.key}`}
                error={lineError(line, "productId")}
                required
                className="sm:col-span-2 xl:col-span-1"
              >
                <Select
                  id={`product-${line.key}`}
                  value={line.productId}
                  onChange={(e) => selectProduct(line.key, e.target.value)}
                  required
                >
                  <option value="" disabled>
                    {t("purchases.selectProduct")}
                  </option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {[product.name, product.strength].filter(Boolean).join(" ")} ({product.unit})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t("common.quantity")}
                htmlFor={`quantity-${line.key}`}
                error={lineError(line, "quantity")}
                required
              >
                <Input
                  id={`quantity-${line.key}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                  required
                />
              </Field>
              <Field
                label={t("purchases.costPrice")}
                htmlFor={`costPrice-${line.key}`}
                error={lineError(line, "costPrice")}
                required
              >
                <Input
                  id={`costPrice-${line.key}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={line.costPrice}
                  onChange={(e) => updateLine(line.key, { costPrice: e.target.value })}
                  required
                />
              </Field>
              <Field
                label={t("purchases.batchNumber")}
                htmlFor={`batchNumber-${line.key}`}
                error={lineError(line, "batchNumber")}
              >
                <Input
                  id={`batchNumber-${line.key}`}
                  maxLength={100}
                  value={line.batchNumber}
                  onChange={(e) => updateLine(line.key, { batchNumber: e.target.value })}
                />
              </Field>
              <Field
                label={t("purchases.expiryDate")}
                htmlFor={`expiryDate-${line.key}`}
                error={lineError(line, "expiryDate")}
              >
                <Input
                  id={`expiryDate-${line.key}`}
                  type="date"
                  value={line.expiryDate}
                  onChange={(e) => updateLine(line.key, { expiryDate: e.target.value })}
                />
              </Field>
              <div className="flex flex-col gap-1.5 sm:col-span-2 xl:col-span-1">
                <span className="text-sm font-medium">{t("purchases.lineTotal")}</span>
                <div className="flex h-10 items-center justify-between gap-2">
                  <span className="text-sm tabular-nums xl:min-w-24 xl:text-right">
                    {f.money(lineAmount(line))}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("purchases.removeItem")}
                    title={t("purchases.removeItem")}
                    onClick={() => removeLine(line.key)}
                    disabled={lines.length === 1}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Button variant="outline" onClick={addLine}>
              <Plus />
              {t("purchases.addItem")}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t("purchases.orderTotal")}
              <span className="ml-3 text-xl font-semibold text-foreground tabular-nums">
                {f.money(total)}
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          {t("purchases.saveAndReceiveHint")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/purchases" className={buttonClass({ variant: "outline" })}>
            {t("common.cancel")}
          </Link>
          {/* First submit button, so pressing Enter in a field saves without receiving. */}
          <Button type="submit" value="order" disabled={pending}>
            {t("purchases.saveOrder")}
          </Button>
          <Button type="submit" value="receive" variant="secondary" disabled={pending}>
            {t("purchases.saveAndReceive")}
          </Button>
        </div>
      </div>
    </form>
  );
}
