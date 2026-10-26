import { CircleCheck, CircleX, Info } from "lucide-react";
import { Badge, Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { getT } from "@/i18n/server";
import { requireSuperAdmin } from "@/lib/auth";
import { pageTitle } from "@/lib/metadata";
import { stripeStatus } from "@/lib/platform";

export const generateMetadata = pageTitle("billing.stripeTitle");

export default async function StripePage() {
  await requireSuperAdmin();
  const t = await getT();
  const stripe = stripeStatus();

  const rows = [
    { label: t("billing.stripeSecretKey"), env: "STRIPE_SECRET_KEY", ok: stripe.hasSecretKey },
    {
      label: t("billing.stripeWebhookSecret"),
      env: "STRIPE_WEBHOOK_SECRET",
      ok: stripe.hasWebhookSecret,
    },
  ];

  return (
    <>
      <PageHeader title={t("billing.stripeTitle")} description={t("billing.stripeDescription")} />

      <div className="grid max-w-2xl gap-4">
        <Card>
          <CardContent>
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <li key={row.env} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{row.label}</p>
                    <p className="font-mono text-xs text-muted-foreground">{row.env}</p>
                  </div>
                  <Badge tone={row.ok ? "success" : "warning"}>
                    {row.ok ? <CircleCheck className="mr-1 size-3.5" /> : <CircleX className="mr-1 size-3.5" />}
                    {row.ok ? t("billing.isSet") : t("billing.notSet")}
                  </Badge>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 py-3">
                <p className="font-medium">{t("billing.stripeMode")}</p>
                <Badge tone={stripe.mode === "live" ? "success" : stripe.mode ? "info" : "muted"}>
                  {stripe.mode === "live"
                    ? t("billing.modeLive")
                    : stripe.mode
                      ? t("billing.modeTest")
                      : t("billing.notSet")}
                </Badge>
              </li>
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">{t("billing.stripeHowTo")}</p>
          </CardContent>
        </Card>

        <div className="flex gap-3 rounded-xl border border-info/40 bg-info/10 p-4 text-sm">
          <Info className="size-5 shrink-0 text-info" />
          <p>{t("billing.stripeNotice")}</p>
        </div>
      </div>
    </>
  );
}
