"use client";

import {
  Bot,
  Camera,
  Check,
  ChartSpline,
  Clock,
  ExternalLink,
  Info,
  KeyRound,
  LoaderCircle,
  Pill,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input, Label, Select } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import type { AiSettings } from "@/lib/ai-settings";
import { cn } from "@/lib/utils";
import { removeAiKey, saveAiSettings, testAiKey } from "./actions";

type Feature = {
  title: MessageKey;
  description: MessageKey;
  icon: LucideIcon;
  iconClass: string;
  /** Form field of a feature that exists; the others are not built yet. */
  field?: "predictionsEnabled" | "expiryEnabled";
};

const FEATURES: Feature[] = [
  { title: "aiAnalytics.fInteractions", description: "aiSettings.interactionsHint", icon: TriangleAlert, iconClass: "text-destructive" },
  { title: "aiAnalytics.fPredictions", description: "aiSettings.predictionsHint", icon: ChartSpline, iconClass: "text-success", field: "predictionsEnabled" },
  { title: "aiAnalytics.fSearch", description: "aiSettings.searchHint", icon: Search, iconClass: "text-info" },
  { title: "aiAnalytics.fExpiry", description: "aiSettings.expiryHint", icon: Clock, iconClass: "text-warning", field: "expiryEnabled" },
  { title: "aiAnalytics.fPrescription", description: "aiSettings.prescriptionHint", icon: Camera, iconClass: "text-chart-3" },
  { title: "aiAnalytics.fSubstitution", description: "aiSettings.substitutionHint", icon: Pill, iconClass: "text-success" },
];

const SEVERITIES: MessageKey[] = [
  "aiSettings.severityMinor",
  "aiSettings.severityModerate",
  "aiSettings.severityMajor",
];

/** OpenAI key, feature switches and advanced options, saved together. */
export function AiSettingsForm({ settings }: { settings: AiSettings }) {
  const t = useT();
  const keyRef = useRef<HTMLInputElement>(null);
  const [testing, startTest] = useTransition();
  const [enabled, setEnabled] = useState({
    predictionsEnabled: settings.predictionsEnabled,
    expiryEnabled: settings.expiryEnabled,
  });
  const { onSubmit, pending, errors } = useFormAction(saveAiSettings, {
    onSuccess: () => {
      if (keyRef.current) keyRef.current.value = "";
    },
  });

  function test() {
    const typed = keyRef.current?.value ?? "";
    startTest(async () => {
      const result = await testAiKey(typed);
      if (result?.ok) toast.success(result.message);
      else if (result?.message) toast.error(result.message);
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-4xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="size-5 text-info" />
            {t("aiSettings.keyTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="openaiKey">{t("aiSettings.keyLabel")}</Label>
            <div className="mt-1.5 flex gap-3">
              <Input
                ref={keyRef}
                id="openaiKey"
                name="openaiKey"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={
                  settings.hasKey
                    ? t("aiSettings.keyReplacePlaceholder", { hint: settings.keyHint ?? "" })
                    : "sk-..."
                }
                aria-invalid={errors.openaiKey ? true : undefined}
                className="h-11 min-w-0 flex-1 font-mono placeholder:font-sans"
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0 border-info/40 text-info hover:bg-info/10"
                disabled={testing}
                onClick={test}
              >
                {testing ? <LoaderCircle className="animate-spin" /> : <Check />}
                {t("aiSettings.test")}
              </Button>
            </div>
            {errors.openaiKey && <p className="mt-1.5 text-xs text-destructive">{errors.openaiKey}</p>}
          </div>

          {settings.hasKey ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm">
              <span className="flex items-center gap-2 text-success">
                <ShieldCheck className="size-4 shrink-0" />
                {t("aiSettings.keySaved", { hint: settings.keyHint ?? "" })}
              </span>
              <ConfirmButton
                action={removeAiKey}
                body={t("aiSettings.removeKeyBody")}
                confirmLabel={t("aiSettings.removeKey")}
                destructive
                type="button"
                variant="ghost"
                size="sm"
              >
                <Trash2 />
                {t("aiSettings.removeKey")}
              </ConfirmButton>
            </div>
          ) : null}

          <div className="rounded-lg border border-info/30 bg-info/10 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Info className="size-4 shrink-0 text-info" />
              {t("aiSettings.howTitle")}
            </p>
            <ol className="mt-2 ml-6 list-decimal space-y-1 text-muted-foreground">
              <li>
                {t("aiSettings.howVisit")}{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-info hover:underline"
                >
                  platform.openai.com/api-keys
                  <ExternalLink className="size-3" />
                </a>
              </li>
              <li>{t("aiSettings.howSignIn")}</li>
              <li>{t("aiSettings.howCreate")}</li>
              <li>{t("aiSettings.howPaste")}</li>
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">{t("aiSettings.keyPrivacy")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="size-5 text-chart-3" />
            {t("aiSettings.featuresTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            const field = feature.field;
            const on = field ? enabled[field] : false;
            return (
              <div
                key={feature.title}
                className="flex items-center gap-4 rounded-lg border border-border px-4 py-3.5"
              >
                <Icon className={cn("size-4 shrink-0", feature.iconClass)} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {t(feature.title)}
                    {!field && <Badge tone="muted">{t("modules.comingSoon")}</Badge>}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{t(feature.description)}</p>
                </div>
                {field && on && <input type="hidden" name={field} value="on" />}
                <Switch
                  checked={on}
                  disabled={!field}
                  label={t(feature.title)}
                  onChange={(value) => field && setEnabled((s) => ({ ...s, [field]: value }))}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {t("aiSettings.advancedTitle")}
            <Badge tone="muted">{t("modules.comingSoon")}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="severity" className="block">{t("aiSettings.severityLabel")}</Label>
          <Select id="severity" disabled defaultValue={SEVERITIES[0]} className="mt-1.5 sm:w-80">
            {SEVERITIES.map((key) => (
              <option key={key} value={key}>
                {t(key)}
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-xs text-muted-foreground">{t("aiSettings.severityHint")}</p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin" /> : <Save />}
          {pending ? t("common.saving") : t("aiSettings.save")}
        </Button>
      </div>
    </form>
  );
}

function Switch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-card shadow transition-transform",
          checked ? "translate-x-5.5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
