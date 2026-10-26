"use client";

import { PackageCheck } from "lucide-react";
import { useState } from "react";
import { useFormat } from "@/components/pharmacy-context";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { receivePurchase } from "./actions";

type ReceiveLine = {
  id: string;
  productName: string;
  unit: string;
  quantity: number;
  batchNumber: string | null;
  expiryDate: string | null;
};

/**
 * "Receive stock" button plus the dialog where the batch number and expiry
 * date of each line are confirmed before the items go into stock.
 */
export function ReceivePurchaseButton({
  purchaseId,
  lines,
}: {
  purchaseId: string;
  lines: ReceiveLine[];
}) {
  const t = useT();
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const { onSubmit, pending, errors } = useFormAction(receivePurchase, {
    onSuccess: () => setOpen(false),
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PackageCheck />
        {t("purchases.receive")}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("purchases.receive")}
        description={t("purchases.receiveDescription")}
        size="lg"
      >
        <form onSubmit={onSubmit}>
          <input type="hidden" name="purchaseId" value={purchaseId} />
          <div className="space-y-3">
            {lines.map((line) => {
              const batchField = `batchNumber.${line.id}`;
              const expiryField = `expiryDate.${line.id}`;
              return (
                <div
                  key={line.id}
                  role="group"
                  aria-label={line.productName}
                  className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2"
                >
                  <div className="sm:col-span-2">
                    <p className="font-medium">{line.productName}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("purchases.quantityOrdered", {
                        quantity: f.number(line.quantity),
                        unit: line.unit,
                      })}
                    </p>
                  </div>
                  <Field
                    label={t("purchases.batchNumber")}
                    htmlFor={batchField}
                    error={errors[batchField]}
                  >
                    <Input
                      id={batchField}
                      name={batchField}
                      maxLength={100}
                      defaultValue={line.batchNumber ?? ""}
                    />
                  </Field>
                  <Field
                    label={t("purchases.expiryDate")}
                    htmlFor={expiryField}
                    error={errors[expiryField]}
                  >
                    <Input
                      id={expiryField}
                      name={expiryField}
                      type="date"
                      defaultValue={line.expiryDate ?? ""}
                    />
                  </Field>
                </div>
              );
            })}
          </div>
          <ModalFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("purchases.receiving") : t("purchases.confirmReceive")}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
