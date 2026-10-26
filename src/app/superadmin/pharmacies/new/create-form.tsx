"use client";

import Link from "next/link";
import { useState } from "react";
import type { SelectOption } from "@/lib/options";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { createPharmacy } from "../actions";
import { PharmacyFields } from "../pharmacy-fields";

/** End dates (YYYY-MM-DD) offered as one-click presets, worked out on the server. */
export type EndDatePresets = { trial: string; month: string; year: string };

export function CreatePharmacyForm({
  defaults,
  currencyOptions,
  timezoneOptions,
  planOptions,
  presets,
  trialDays,
}: {
  defaults: { currency: string; timezone: string };
  currencyOptions: SelectOption[];
  timezoneOptions: SelectOption[];
  planOptions: SelectOption[];
  presets: EndDatePresets;
  trialDays: number;
}) {
  const t = useT();
  const { onSubmit, pending, errors } = useFormAction(createPharmacy);
  const [endDate, setEndDate] = useState(presets.trial);

  const endDatePresets = [
    { value: presets.trial, label: t("platform.presetTrial", { days: trialDays }) },
    { value: presets.month, label: t("platform.presetMonth") },
    { value: presets.year, label: t("platform.presetYear") },
    { value: "", label: t("platform.presetNone") },
  ];

  return (
    <form onSubmit={onSubmit} className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("platform.sectionPharmacy")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <PharmacyFields
            values={{
              name: "",
              email: null,
              phone: null,
              address: null,
              licenseNumber: null,
              ...defaults,
            }}
            errors={errors}
            currencyOptions={currencyOptions}
            timezoneOptions={timezoneOptions}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("platform.sectionSubscription")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t("platform.plan")} htmlFor="planId" error={errors.planId}>
            <Select id="planId" name="planId" defaultValue="">
              <option value="">{t("platform.noPlan")}</option>
              {planOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("platform.subscriptionStatus")}
            htmlFor="subscriptionStatus"
            error={errors.subscriptionStatus}
            required
          >
            <Select
              id="subscriptionStatus"
              name="subscriptionStatus"
              defaultValue="trial"
              required
            >
              <option value="trial">{t("subscription.statusTrial")}</option>
              <option value="active">{t("subscription.statusActive")}</option>
            </Select>
          </Field>
          <Field
            label={t("platform.endDate")}
            htmlFor="endDate"
            error={errors.endDate}
            hint={t("platform.endDateHint")}
            className="sm:col-span-2"
          >
            <Input
              id="endDate"
              name="endDate"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="sm:max-w-xs"
            />
            <div className="flex flex-wrap gap-2">
              {endDatePresets.map((preset) => (
                <Button
                  key={preset.label}
                  variant={endDate === preset.value ? "secondary" : "outline"}
                  size="sm"
                  aria-pressed={endDate === preset.value}
                  onClick={() => setEndDate(preset.value)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="block">
          <CardTitle>{t("platform.sectionAdmin")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t("platform.sectionAdminHint")}</p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("platform.adminName")}
            htmlFor="adminName"
            error={errors.adminName}
            required
            className="sm:col-span-2"
          >
            <Input id="adminName" name="adminName" maxLength={100} required />
          </Field>
          <Field
            label={t("platform.adminEmail")}
            htmlFor="adminEmail"
            error={errors.adminEmail}
            required
          >
            <Input id="adminEmail" name="adminEmail" type="email" autoComplete="off" required />
          </Field>
          <Field
            label={t("platform.adminPassword")}
            htmlFor="adminPassword"
            error={errors.adminPassword}
            hint={t("platform.passwordHint")}
            required
          >
            <Input
              id="adminPassword"
              name="adminPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Link href="/superadmin/pharmacies" className={buttonClass({ variant: "outline" })}>
          {t("common.cancel")}
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? t("platform.creating") : t("platform.createPharmacy")}
        </Button>
      </div>
    </form>
  );
}
