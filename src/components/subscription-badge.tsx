import { Badge } from "@/components/ui/card";
import { getT } from "@/i18n/server";
import { STATE_LABEL, STATE_TONE, type SubscriptionState } from "@/lib/subscription";

/** Coloured badge for a subscription state (server components only). */
export async function SubscriptionBadge({ state }: { state: SubscriptionState }) {
  const t = await getT();
  return <Badge tone={STATE_TONE[state]}>{t(STATE_LABEL[state])}</Badge>;
}
