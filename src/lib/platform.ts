/*
 * Settings of the platform itself (as opposed to a pharmacy): the currency
 * and time zone the super admin's revenue figures are reported in, and
 * whether Stripe has been configured.
 */

/** Revenue on the super admin dashboard is reported in this currency only. */
export const PLATFORM_CURRENCY = process.env.PLATFORM_CURRENCY || "THB";

/** "This month" and "today" on the super admin dashboard follow this time zone. */
export const PLATFORM_TIMEZONE = process.env.PLATFORM_TIMEZONE || "Asia/Bangkok";

export type StripeStatus = {
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  /** From the secret key prefix; null when no key is set. */
  mode: "test" | "live" | null;
  configured: boolean;
};

/** What is known about the Stripe setup from the environment. Never exposes the keys. */
export function stripeStatus(): StripeStatus {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const hasSecretKey = key.length > 0;
  const hasWebhookSecret = (process.env.STRIPE_WEBHOOK_SECRET ?? "").length > 0;
  const mode = !hasSecretKey ? null : key.startsWith("sk_live_") ? "live" : "test";
  return { hasSecretKey, hasWebhookSecret, mode, configured: hasSecretKey && hasWebhookSecret };
}
