import type { Pharmacy } from "@/db/schema";
import type { MessageKey, Translate } from "@/i18n/messages";
import { daysUntil } from "@/lib/time";

/** What a pharmacy's subscription looks like to a person: the stored status plus the derived ones. */
export type SubscriptionState = "trial" | "active" | "cancelled" | "expired" | "suspended";

export const SUBSCRIPTION_STATES = [
  "active",
  "trial",
  "expired",
  "cancelled",
  "suspended",
] as const satisfies readonly SubscriptionState[];

/**
 * The state to show for a pharmacy. Follows hasAccess() in src/lib/auth.ts:
 * exactly "trial" and "active" mean the pharmacy can use the app.
 */
export function subscriptionState(
  pharmacy: Pick<Pharmacy, "status" | "subscriptionStatus" | "subscriptionEndsAt">,
  now: Date,
): SubscriptionState {
  if (pharmacy.status !== "active") return "suspended";
  if (pharmacy.subscriptionStatus === "cancelled") return "cancelled";
  if (pharmacy.subscriptionEndsAt && pharmacy.subscriptionEndsAt < now) return "expired";
  return pharmacy.subscriptionStatus;
}

export const STATE_LABEL: Record<SubscriptionState, MessageKey> = {
  trial: "subscription.statusTrial",
  active: "subscription.statusActive",
  cancelled: "subscription.statusCancelled",
  expired: "subscription.statusExpired",
  suspended: "subscription.statusSuspended",
};

export const STATE_TONE: Record<
  SubscriptionState,
  "success" | "info" | "warning" | "danger" | "muted"
> = {
  trial: "info",
  active: "success",
  cancelled: "muted",
  expired: "warning",
  suspended: "danger",
};

/** "12 days left" for an end date still ahead, null once it has passed. */
export function daysLeftLabel(t: Translate, endsAt: Date): string | null {
  const days = daysUntil(endsAt);
  if (days <= 0) return null;
  return days === 1 ? t("subscription.lastDay") : t("subscription.daysLeft", { days });
}
