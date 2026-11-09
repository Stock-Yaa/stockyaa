"use client";

import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useT } from "@/i18n/client";
import { isBuyerId, normaliseBuyerId, type BuyerIdKind } from "@/lib/buyer-id";

/** The buyer on a full tax receipt, as typed in the form. */
export type TaxBuyer = {
  buyerName: string;
  /** A Thai tax ID, or a passport number for a foreign buyer. */
  buyerIdType: BuyerIdKind;
  buyerTaxId: string;
  buyerAddress: string;
  /** none = a private person; head = a company's head office; branch = branchCode. */
  branchType: "none" | "head" | "branch";
  branchCode: string;
  saveToCustomer: boolean;
};

const HEAD_OFFICE = "00000";

/** Empty buyer, or one filled in from the customer's saved details. */
export function buyerFrom(customer?: {
  name: string;
  taxIdType: BuyerIdKind;
  taxId: string | null;
  taxBranch: string | null;
  address: string | null;
} | null): TaxBuyer {
  const branch = customer?.taxBranch ?? null;
  return {
    buyerName: customer?.name ?? "",
    buyerIdType: customer?.taxIdType ?? "tax_id",
    buyerTaxId: customer?.taxId ?? "",
    buyerAddress: customer?.address ?? "",
    branchType: branch === null ? "none" : branch === HEAD_OFFICE ? "head" : "branch",
    branchCode: branch && branch !== HEAD_OFFICE ? branch : "",
    // Save by default when the customer has no tax details yet.
    saveToCustomer: Boolean(customer && !customer.taxId),
  };
}

/** What the server stores for the buyer's branch. */
export function buyerBranchValue(buyer: TaxBuyer): string {
  // A foreign buyer has no Thai branch.
  if (buyer.buyerIdType === "passport") return "";
  if (buyer.branchType === "head") return HEAD_OFFICE;
  if (buyer.branchType === "branch") return buyer.branchCode.trim();
  return "";
}

/** The buyer as the server expects it (createSale and issueTaxReceipt). */
export function buyerPayload(buyer: TaxBuyer, customerId: string | null) {
  return {
    buyerName: buyer.buyerName.trim(),
    buyerIdType: buyer.buyerIdType,
    buyerTaxId: normaliseBuyerId(buyer.buyerTaxId, buyer.buyerIdType),
    buyerAddress: buyer.buyerAddress.trim(),
    buyerBranch: buyerBranchValue(buyer),
    saveToCustomer: Boolean(customerId) && buyer.saveToCustomer,
    customerId,
  };
}

/** True when the details are complete enough to send. */
export function buyerReady(buyer: TaxBuyer): boolean {
  return (
    buyer.buyerName.trim() !== "" &&
    isBuyerId(buyer.buyerTaxId, buyer.buyerIdType) &&
    buyer.buyerAddress.trim() !== "" &&
    (buyer.buyerIdType === "passport" ||
      buyer.branchType !== "branch" ||
      /^\d{5}$/.test(buyer.branchCode.trim()))
  );
}

/**
 * Buyer name, tax ID, address and branch. Controlled; the inputs also carry
 * names, so the fields can sit in a plain form (buyerBranch is computed).
 */
export function TaxBuyerFields({
  value,
  onChange,
  errors = {},
  hasCustomer,
}: {
  value: TaxBuyer;
  onChange: (next: TaxBuyer) => void;
  errors?: Record<string, string>;
  hasCustomer: boolean;
}) {
  const t = useT();
  const set = (changes: Partial<TaxBuyer>) => onChange({ ...value, ...changes });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("taxReceipt.buyerName")} htmlFor="buyerName" error={errors.buyerName} required className="sm:col-span-2">
        <Input
          id="buyerName"
          name="buyerName"
          value={value.buyerName}
          maxLength={200}
          onChange={(e) => set({ buyerName: e.target.value })}
          required
          autoFocus
        />
      </Field>
      <Field label={t("taxReceipt.buyerIdType")} htmlFor="buyerIdType" error={errors.buyerIdType}>
        <Select
          id="buyerIdType"
          name="buyerIdType"
          value={value.buyerIdType}
          onChange={(e) => set({ buyerIdType: e.target.value as BuyerIdKind })}
        >
          <option value="tax_id">{t("taxReceipt.idTypeTaxId")}</option>
          <option value="passport">{t("taxReceipt.idTypePassport")}</option>
        </Select>
      </Field>
      <Field
        label={t(value.buyerIdType === "passport" ? "taxReceipt.buyerPassport" : "taxReceipt.buyerTaxId")}
        htmlFor="buyerTaxId"
        error={errors.buyerTaxId}
        hint={t(value.buyerIdType === "passport" ? "taxReceipt.buyerPassportHint" : "taxReceipt.buyerTaxIdHint")}
        required
      >
        <Input
          id="buyerTaxId"
          name="buyerTaxId"
          inputMode={value.buyerIdType === "passport" ? "text" : "numeric"}
          value={value.buyerTaxId}
          maxLength={value.buyerIdType === "passport" ? 24 : 17}
          onChange={(e) => set({ buyerTaxId: e.target.value })}
          required
          className="tabular-nums"
        />
      </Field>
      {value.buyerIdType === "passport" ? (
        <input type="hidden" name="buyerBranch" value="" />
      ) : (
      <Field label={t("taxReceipt.buyerBranch")} htmlFor="branchType" error={errors.buyerBranch} className="sm:col-span-2">
        <input type="hidden" name="buyerBranch" value={buyerBranchValue(value)} />
        <div className="flex gap-2">
          <Select
            id="branchType"
            value={value.branchType}
            onChange={(e) => set({ branchType: e.target.value as TaxBuyer["branchType"] })}
            className="flex-1"
          >
            <option value="none">{t("taxReceipt.branchNone")}</option>
            <option value="head">{t("taxReceipt.branchHead")}</option>
            <option value="branch">{t("taxReceipt.branchNumber")}</option>
          </Select>
          {value.branchType === "branch" && (
            <Input
              aria-label={t("taxReceipt.branchNumber")}
              inputMode="numeric"
              placeholder="00001"
              maxLength={5}
              value={value.branchCode}
              onChange={(e) => set({ branchCode: e.target.value.replace(/\D/g, "") })}
              className="w-24 tabular-nums"
              required
            />
          )}
        </div>
      </Field>
      )}
      <Field label={t("taxReceipt.buyerAddress")} htmlFor="buyerAddress" error={errors.buyerAddress} required className="sm:col-span-2">
        <Textarea
          id="buyerAddress"
          name="buyerAddress"
          rows={3}
          maxLength={500}
          value={value.buyerAddress}
          onChange={(e) => set({ buyerAddress: e.target.value })}
          required
        />
      </Field>
      {hasCustomer && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            name="saveToCustomer"
            checked={value.saveToCustomer}
            onChange={(e) => set({ saveToCustomer: e.target.checked })}
            className="size-4 accent-primary"
          />
          {t("taxReceipt.saveToCustomer")}
        </label>
      )}
    </div>
  );
}
