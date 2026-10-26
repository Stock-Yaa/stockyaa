import type { BillingPayment } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";

export const METHOD_LABEL: Record<BillingPayment["method"], MessageKey> = {
  cash: "billing.methodCash",
  transfer: "billing.methodTransfer",
  stripe: "billing.methodStripe",
};

/** Chart colour per method; fixed so a method keeps its colour whatever else is shown. */
export const METHOD_COLOR: Record<BillingPayment["method"], string> = {
  cash: "var(--chart-2)",
  transfer: "var(--chart-3)",
  stripe: "var(--chart-1)",
};

export const PAYMENT_STATUS_LABEL: Record<BillingPayment["status"], MessageKey> = {
  succeeded: "billing.statusSucceeded",
  failed: "billing.statusFailed",
  refunded: "billing.statusRefunded",
};

export const PAYMENT_STATUS_TONE: Record<
  BillingPayment["status"],
  "success" | "danger" | "muted"
> = {
  succeeded: "success",
  failed: "danger",
  refunded: "muted",
};

/** Months of access a payment can buy from the record-payment form. */
export const PERIOD_OPTIONS = [
  { months: 1, label: "billing.period1" },
  { months: 3, label: "billing.period3" },
  { months: 6, label: "billing.period6" },
  { months: 12, label: "billing.period12" },
] as const satisfies readonly { months: number; label: MessageKey }[];
