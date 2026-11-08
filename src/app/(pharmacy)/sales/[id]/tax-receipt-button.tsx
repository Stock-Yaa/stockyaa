"use client";

import { FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { issueTaxReceipt } from "../actions";
import { TaxBuyerFields, buyerFrom, buyerReady, type TaxBuyer } from "../tax-buyer-fields";

/** "Issue tax receipt" for a sale without one; opens it once issued. */
export function IssueTaxReceiptButton({
  saleId,
  customer,
}: {
  saleId: string;
  customer: { name: string; taxId: string | null; taxBranch: string | null; address: string | null } | null;
}) {
  const t = useT();
  const router = useRouter();
  const [buyer, setBuyer] = useState<TaxBuyer | null>(null);
  const { onSubmit, pending, errors } = useFormAction(issueTaxReceipt, {
    onSuccess: () => {
      setBuyer(null);
      router.push(`/sales/${saleId}/tax-receipt`);
    },
  });

  return (
    <>
      <Button variant="outline" onClick={() => setBuyer(buyerFrom(customer))}>
        <FileText />
        {t("taxReceipt.issue")}
      </Button>
      <Modal
        open={buyer !== null}
        onClose={() => setBuyer(null)}
        title={t("taxReceipt.issueTitle")}
        description={t("taxReceipt.issueHint")}
        size="lg"
      >
        {buyer && (
          <form onSubmit={onSubmit} className="grid gap-4">
            <input type="hidden" name="saleId" value={saleId} />
            <TaxBuyerFields value={buyer} onChange={setBuyer} errors={errors} hasCustomer={customer !== null} />
            <ModalFooter>
              <Button variant="outline" onClick={() => setBuyer(null)} disabled={pending}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={pending || !buyerReady(buyer)}>
                {pending ? t("common.saving") : t("taxReceipt.issue")}
              </Button>
            </ModalFooter>
          </form>
        )}
      </Modal>
    </>
  );
}
