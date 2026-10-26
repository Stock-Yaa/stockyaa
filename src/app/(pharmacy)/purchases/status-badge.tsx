import { Badge } from "@/components/ui/card";
import type { Purchase } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";

type Status = Purchase["status"];

const TONES: Record<Status, "info" | "success" | "muted"> = {
  ordered: "info",
  received: "success",
  cancelled: "muted",
};

export const PURCHASE_STATUS_LABELS: Record<Status, MessageKey> = {
  ordered: "purchases.statusOrdered",
  received: "purchases.statusReceived",
  cancelled: "purchases.statusCancelled",
};

export async function PurchaseStatusBadge({ status }: { status: Status }) {
  const t = await getT();
  return <Badge tone={TONES[status]}>{t(PURCHASE_STATUS_LABELS[status])}</Badge>;
}
