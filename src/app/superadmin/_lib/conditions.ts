import { and, eq, gte, isNull, lt, ne, or, type SQL } from "drizzle-orm";
import type { SubscriptionState } from "@/lib/subscription";
import { pharmacies } from "@/db/schema";

/** SQL twin of hasAccess() in src/lib/auth.ts: pharmacies that can use the app at `now`. */
export function accessCondition(now: Date): SQL | undefined {
  return and(
    eq(pharmacies.status, "active"),
    ne(pharmacies.subscriptionStatus, "cancelled"),
    or(isNull(pharmacies.subscriptionEndsAt), gte(pharmacies.subscriptionEndsAt, now)),
  );
}

/** SQL twin of subscriptionState(): pharmacies whose displayed state is `state` at `now`. */
export function stateCondition(state: SubscriptionState, now: Date): SQL | undefined {
  const notSuspended = eq(pharmacies.status, "active");
  switch (state) {
    case "suspended":
      return ne(pharmacies.status, "active");
    case "cancelled":
      return and(notSuspended, eq(pharmacies.subscriptionStatus, "cancelled"));
    case "expired":
      return and(
        notSuspended,
        ne(pharmacies.subscriptionStatus, "cancelled"),
        lt(pharmacies.subscriptionEndsAt, now),
      );
    case "trial":
    case "active":
      return and(accessCondition(now), eq(pharmacies.subscriptionStatus, state));
  }
}
