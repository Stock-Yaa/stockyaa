"use client";

import type { SelectOption } from "@/lib/options";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import type { Pharmacy } from "@/db/schema";
import { useT } from "@/i18n/client";

export type PharmacyDetails = Pick<
  Pharmacy,
  "name" | "email" | "phone" | "address" | "licenseNumber" | "currency" | "timezone"
>;

/**
 * The pharmacy detail inputs shared by the "new pharmacy" form and the detail
 * page. Renders grid cells; the parent supplies the two-column grid.
 */
export function PharmacyFields({
  values,
  errors,
  currencyOptions,
  timezoneOptions,
}: {
  values: PharmacyDetails;
  errors: Record<string, string>;
  currencyOptions: SelectOption[];
  timezoneOptions: SelectOption[];
}) {
  const t = useT();
  return (
    <>
      <Field
        label={t("platform.pharmacyName")}
        htmlFor="pharmacy-name"
        error={errors.name}
        required
        className="sm:col-span-2"
      >
        <Input id="pharmacy-name" name="name" defaultValue={values.name} required />
      </Field>
      <Field label={t("common.email")} htmlFor="pharmacy-email" error={errors.email}>
        <Input
          id="pharmacy-email"
          name="email"
          type="email"
          defaultValue={values.email ?? ""}
        />
      </Field>
      <Field label={t("common.phone")} htmlFor="pharmacy-phone" error={errors.phone}>
        <Input id="pharmacy-phone" name="phone" type="tel" defaultValue={values.phone ?? ""} />
      </Field>
      <Field
        label={t("common.address")}
        htmlFor="pharmacy-address"
        error={errors.address}
        className="sm:col-span-2"
      >
        <Textarea id="pharmacy-address" name="address" defaultValue={values.address ?? ""} />
      </Field>
      <Field
        label={t("platform.licenseNumber")}
        htmlFor="pharmacy-license"
        error={errors.licenseNumber}
        className="sm:col-span-2"
      >
        <Input
          id="pharmacy-license"
          name="licenseNumber"
          defaultValue={values.licenseNumber ?? ""}
        />
      </Field>
      <Field
        label={t("platform.currency")}
        htmlFor="pharmacy-currency"
        error={errors.currency}
        required
      >
        <Select id="pharmacy-currency" name="currency" defaultValue={values.currency} required>
          {currencyOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={t("platform.timezone")}
        htmlFor="pharmacy-timezone"
        error={errors.timezone}
        required
      >
        <Select id="pharmacy-timezone" name="timezone" defaultValue={values.timezone} required>
          {timezoneOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
