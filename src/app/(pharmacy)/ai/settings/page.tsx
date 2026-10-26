import { Bot } from "lucide-react";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { getT } from "@/i18n/server";
import { canSwitchBranch } from "@/lib/active-branch";
import { getAiSettings } from "@/lib/ai-settings";
import { requirePharmacy } from "@/lib/auth";
import { pageTitle } from "@/lib/metadata";
import { AiSettingsForm } from "./ai-settings-form";

export const generateMetadata = pageTitle("nav.aiConfig");

export default async function AiSettingsPage() {
  const { user, pharmacy } = await requirePharmacy();
  if (!canSwitchBranch(user)) notFound();
  const [t, db] = await Promise.all([getT(), getDb()]);
  const settings = await getAiSettings(db, pharmacy.id);

  return (
    <>
      <div className="mb-6 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-chart-3/15 text-chart-3">
          <Bot className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{t("aiSettings.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("aiSettings.description")}</p>
        </div>
      </div>
      <AiSettingsForm settings={settings} />
    </>
  );
}
