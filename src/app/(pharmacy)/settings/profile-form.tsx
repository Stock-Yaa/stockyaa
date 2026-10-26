"use client";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import type { Pharmacy } from "@/db/schema";
import { useT } from "@/i18n/client";
import { updatePharmacyProfile } from "./actions";
import type { SelectOption } from "@/lib/options";

export type PharmacyProfile = Pick<
  Pharmacy,
  | "name"
  | "phone"
  | "email"
  | "address"
  | "licenseNumber"
  | "taxId"
  | "currency"
  | "timezone"
  | "taxRate"
  | "expiryAlertDays"
  | "receiptFooter"
>;

export function ProfileForm({
  profile,
  currencyOptions,
  timezoneOptions,
}: {
  profile: PharmacyProfile;
  currencyOptions: SelectOption[];
  timezoneOptions: SelectOption[];
}) {
  const t = useT();
  const { onSubmit, pending, errors } = useFormAction(updatePharmacyProfile);

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field
        label={t("settings.pharmacyName")}
        htmlFor="name"
        error={errors.name}
        required
        className="sm:col-span-2"
      >
        <Input id="name" name="name" defaultValue={profile.name} required />
      </Field>
      <Field label={t("common.phone")} htmlFor="phone" error={errors.phone}>
        <Input id="phone" name="phone" type="tel" defaultValue={profile.phone ?? ""} />
      </Field>
      <Field label={t("common.email")} htmlFor="email" error={errors.email}>
        <Input id="email" name="email" type="email" defaultValue={profile.email ?? ""} />
      </Field>
      <Field
        label={t("common.address")}
        htmlFor="address"
        error={errors.address}
        className="sm:col-span-2"
      >
        <Textarea id="address" name="address" defaultValue={profile.address ?? ""} />
      </Field>
      <Field
        label={t("settings.licenseNumber")}
        htmlFor="licenseNumber"
        error={errors.licenseNumber}
      >
        <Input
          id="licenseNumber"
          name="licenseNumber"
          defaultValue={profile.licenseNumber ?? ""}
        />
      </Field>
      <Field label={t("settings.taxId")} htmlFor="taxId" error={errors.taxId}>
        <Input id="taxId" name="taxId" defaultValue={profile.taxId ?? ""} />
      </Field>
      <Field label={t("settings.currency")} htmlFor="currency" error={errors.currency} required>
        <Select id="currency" name="currency" defaultValue={profile.currency} required>
          {currencyOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("settings.timezone")} htmlFor="timezone" error={errors.timezone} required>
        <Select id="timezone" name="timezone" defaultValue={profile.timezone} required>
          {timezoneOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={t("settings.taxRate")}
        htmlFor="taxRate"
        error={errors.taxRate}
        hint={t("settings.taxRateHint")}
        required
      >
        <Input
          id="taxRate"
          name="taxRate"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step="0.01"
          defaultValue={profile.taxRate}
          required
        />
      </Field>
      <Field
        label={t("settings.expiryAlertDays")}
        htmlFor="expiryAlertDays"
        error={errors.expiryAlertDays}
        hint={t("settings.expiryAlertDaysHint")}
        required
      >
        <Input
          id="expiryAlertDays"
          name="expiryAlertDays"
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          step={1}
          defaultValue={profile.expiryAlertDays}
          required
        />
      </Field>
      <Field
        label={t("settings.receiptFooter")}
        htmlFor="receiptFooter"
        error={errors.receiptFooter}
        hint={t("settings.receiptFooterHint")}
        className="sm:col-span-2"
      >
        <Textarea
          id="receiptFooter"
          name="receiptFooter"
          maxLength={500}
          defaultValue={profile.receiptFooter ?? ""}
        />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("common.saveChanges")}
        </Button>
      </div>
    </form>
  );
}
