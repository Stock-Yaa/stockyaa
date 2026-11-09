import type { Translate } from "@/i18n/messages";
import { getFormat } from "@/lib/format-server";
import type { PlanPrice } from "../payments/record-payment-form";

type PlanRow = {
  id: string;
  name: string;
  isActive: boolean;
  priceMonthly: number;
  priceYearly: number | null;
  currency: string;
};

/** Plans offered in the record-payment dialog: active ones, priced in their own currency. */
export function planPrices(planList: PlanRow[], t: Translate): Promise<PlanPrice[]> {
  return Promise.all(
    planList
      .filter((plan) => plan.isActive)
      .map(async (plan) => ({
        id: plan.id,
        label: `${plan.name} · ${t("subscription.perMonth", {
          price: (await getFormat(null, plan.currency)).money(plan.priceMonthly),
        })}`,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
      })),
  );
}
