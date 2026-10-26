import type { Sale } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";

export const PAYMENT_METHOD_LABEL: Record<Sale["paymentMethod"], MessageKey> = {
  cash: "sales.cash",
  card: "sales.card",
  transfer: "sales.transfer",
};

export const SALE_STATUS_LABEL: Record<Sale["status"], MessageKey> = {
  completed: "sales.statusCompleted",
  refunded: "sales.statusRefunded",
};
