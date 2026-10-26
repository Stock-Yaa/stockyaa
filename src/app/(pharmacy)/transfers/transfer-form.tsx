"use client";

import { Plus, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useFormat } from "@/components/pharmacy-context";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { createTransfer } from "./actions";

type BranchOption = { id: string; name: string };
type ProductOption = { id: string; label: string; unit: string; available: number };

/** One row of the transfer. Inputs are kept as typed; the server parses them. */
type Line = {
  /** Stable React key; never sent to the server. */
  key: number;
  productId: string;
  quantity: string;
};

const emptyLine = (key: number): Line => ({ key, productId: "", quantity: "" });

/** New transfer form: destination, line items and notes. */
export function TransferForm({
  destinations,
  products,
}: {
  destinations: BranchOption[];
  /** Products with sellable stock in the sending branch. */
  products: ProductOption[];
}) {
  const t = useT();
  const f = useFormat();
  const [lines, setLines] = useState<Line[]>([emptyLine(0)]);
  // Line keys in the order they were last submitted: the server reports item
  // errors by position ("items.2.quantity"), and rows may move afterwards.
  const [submittedKeys, setSubmittedKeys] = useState<number[]>([]);
  const { onSubmit, pending, errors } = useFormAction(createTransfer);
  const productById = new Map(products.map((p) => [p.id, p]));

  const items = JSON.stringify(
    lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
  );

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
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

  function lineError(line: Line, field: "productId" | "quantity"): string | undefined {
    const index = submittedKeys.indexOf(line.key);
    return index === -1 ? undefined : errors[`items.${index}.${field}`];
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    setSubmittedKeys(lines.map((line) => line.key));
    onSubmit(event);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="items" value={items} />

      <Card>
        <CardHeader>
          <CardTitle>{t("transfers.details")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("transfers.toBranch")}
            htmlFor="toBranchId"
            error={errors.toBranchId}
            required
          >
            <Select
              id="toBranchId"
              name="toBranchId"
              defaultValue={destinations.length === 1 ? destinations[0].id : ""}
              required
            >
              <option value="" disabled>
                {t("transfers.selectBranch")}
              </option>
              {destinations.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("common.notes")} htmlFor="notes" error={errors.notes}>
            <Textarea id="notes" name="notes" rows={1} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("transfers.items")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("transfers.fefoHint")}</p>
          {errors.items && (
            <p role="alert" className="text-sm text-destructive">
              {errors.items}
            </p>
          )}

          {lines.map((line) => {
            const product = productById.get(line.productId);
            return (
              <div
                key={line.key}
                className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
              >
                <Field
                  label={t("transfers.product")}
                  htmlFor={`product-${line.key}`}
                  error={lineError(line, "productId")}
                  required
                >
                  <Select
                    id={`product-${line.key}`}
                    value={line.productId}
                    onChange={(e) => updateLine(line.key, { productId: e.target.value })}
                    required
                  >
                    <option value="" disabled>
                      {t("transfers.selectProduct")}
                    </option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} ({t("transfers.available", { count: f.number(p.available) })})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label={t("common.quantity")}
                  htmlFor={`quantity-${line.key}`}
                  error={lineError(line, "quantity")}
                  hint={product?.unit}
                  required
                >
                  <Input
                    id={`quantity-${line.key}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={product?.available}
                    step={1}
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                    required
                  />
                </Field>
                <div className="flex items-end pb-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("transfers.removeItem")}
                    title={t("transfers.removeItem")}
                    onClick={() => removeLine(line.key)}
                    disabled={lines.length === 1}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            );
          })}

          <Button variant="outline" onClick={addLine}>
            <Plus />
            {t("transfers.addItem")}
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href="/transfers" className={buttonClass({ variant: "outline" })}>
          {t("common.cancel")}
        </Link>
        <Button type="submit" disabled={pending}>
          <Send />
          {pending ? t("common.saving") : t("transfers.send")}
        </Button>
      </div>
    </form>
  );
}
