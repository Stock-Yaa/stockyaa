import type { PriceLevel } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";

/** Name of each selling price level, and the badge tone it is shown with. */
export const PRICE_LEVEL_LABEL: Record<PriceLevel, MessageKey> = {
  regular: "customers.levelRegular",
  member: "customers.levelMember",
  staff: "customers.levelStaff",
};

export const PRICE_LEVEL_TONE: Record<PriceLevel, "muted" | "info" | "warning"> = {
  regular: "muted",
  member: "info",
  staff: "warning",
};
