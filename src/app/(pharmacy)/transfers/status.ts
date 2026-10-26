import type { TransferStatus } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, MessageKey> = {
  in_transit: "transfers.statusInTransit",
  received: "transfers.statusReceived",
  cancelled: "transfers.statusCancelled",
};

export const TRANSFER_STATUS_TONES: Record<TransferStatus, "warning" | "success" | "muted"> = {
  in_transit: "warning",
  received: "success",
  cancelled: "muted",
};
