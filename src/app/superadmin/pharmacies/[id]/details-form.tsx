"use client";

import type { SelectOption } from "@/lib/options";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { updatePharmacyDetails } from "../actions";
import { PharmacyFields, type PharmacyDetails } from "../pharmacy-fields";

export function DetailsForm({
  pharmacyId,
  values,
  currencyOptions,
  timezoneOptions,
}: {
  pharmacyId: string;
  values: PharmacyDetails;
  currencyOptions: SelectOption[];
  timezoneOptions: SelectOption[];
}) {
  const t = useT();
  const { onSubmit, pending, errors } = useFormAction(updatePharmacyDetails);

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={pharmacyId} />
      <PharmacyFields
        values={values}
        errors={errors}
        currencyOptions={currencyOptions}
        timezoneOptions={timezoneOptions}
      />
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("common.saveChanges")}
        </Button>
      </div>
    </form>
  );
}
