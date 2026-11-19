import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { getT } from "@/i18n/server";
import type { Patient } from "@/lib/dosing";
import type { LabelLanguage } from "@/lib/label-layout";

/** The values of the patient form, read from the URL (it is a GET form). */
export type PatientParams = {
  patient: Patient;
  patientName: string;
  pharmacistId: string | null;
  lang: LabelLanguage;
  years: string;
  months: string;
  weight: string;
};

const wholeNumber = (v: string) => (/^\d{1,3}$/.test(v.trim()) ? Number(v) : null);

/**
 * Reads the patient form. There is no default patient group: until the
 * pharmacist chooses adult or child, nothing is suggested.
 */
export function readPatientParams(
  param: (key: string) => string,
  has: (key: string) => boolean,
  defaults: { patientName: string; pharmacistId: string | null },
): PatientParams {
  const groupParam = param("group");
  const group: Patient["group"] = groupParam === "child" || groupParam === "adult" ? groupParam : null;
  const years = wholeNumber(param("years"));
  const months = wholeNumber(param("months"));
  const ageMonths = years === null && months === null ? null : (years ?? 0) * 12 + (months ?? 0);
  const weightValue = Number(param("weight").replace(",", "."));
  const weightKg = param("weight").trim() && weightValue > 0 && weightValue < 500 ? weightValue : null;
  return {
    patient: { group, ageMonths, weightKg },
    patientName: has("patient") ? param("patient").trim() : defaults.patientName,
    pharmacistId: has("pharmacist") ? param("pharmacist") || null : defaults.pharmacistId,
    lang: param("lang") === "en" ? "en" : "th",
    years: param("years"),
    months: param("months"),
    weight: param("weight"),
  };
}

/** The patient, pharmacist and label language, entered once for every label of the page. */
export async function PatientForm({
  values,
  pharmacists,
  hidden = {},
}: {
  values: PatientParams;
  pharmacists: { id: string; name: string; license: string }[];
  /** Extra parameters the page needs to keep (the POS cart). */
  hidden?: Record<string, string>;
}) {
  const t = await getT();
  return (
    <Card className="mb-6 print:hidden">
      <CardContent>
        <form method="get" className="grid gap-4 sm:grid-cols-6">
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <Field label={t("dispensing.patientName")} htmlFor="label-patient" className="sm:col-span-3" required>
            <Input id="label-patient" name="patient" defaultValue={values.patientName} maxLength={100} required />
          </Field>
          <Field
            label={t("dispensing.pharmacist")}
            htmlFor="label-pharmacist"
            className="sm:col-span-3"
            hint={pharmacists.length === 0 ? t("dispensing.noLicensedPharmacist") : undefined}
            required
          >
            <Select id="label-pharmacist" name="pharmacist" defaultValue={values.pharmacistId ?? ""} required>
              <option value="" disabled>
                {t("dispensing.chooseGroup")}
              </option>
              {pharmacists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.license}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("dispensing.group")} htmlFor="label-group" className="sm:col-span-2" required>
            <Select id="label-group" name="group" defaultValue={values.patient.group ?? ""} required>
              <option value="" disabled>
                {t("dispensing.chooseGroup")}
              </option>
              <option value="adult">{t("dispensing.adult")}</option>
              <option value="child">{t("dispensing.child")}</option>
            </Select>
          </Field>
          <Field label={t("dispensing.ageYears")} htmlFor="label-years">
            <Input id="label-years" name="years" type="number" min={0} max={120} inputMode="numeric" defaultValue={values.years} />
          </Field>
          <Field label={t("dispensing.ageMonths")} htmlFor="label-months">
            <Input id="label-months" name="months" type="number" min={0} max={11} inputMode="numeric" defaultValue={values.months} />
          </Field>
          <Field label={t("dispensing.weight")} htmlFor="label-weight" hint={t("dispensing.weightHint")} className="sm:col-span-2">
            <Input id="label-weight" name="weight" type="number" min={0} step="0.1" inputMode="decimal" defaultValue={values.weight} />
          </Field>
          <Field label={t("dispensing.labelLanguage")} htmlFor="label-lang" className="sm:col-span-2">
            <Select id="label-lang" name="lang" defaultValue={values.lang}>
              <option value="th">{t("dispensing.langTh")}</option>
              <option value="en">{t("dispensing.langEn")}</option>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground sm:col-span-3 sm:self-end">{t("dispensing.updateHint")}</p>
          <div className="sm:col-span-1 sm:self-end">
            <Button type="submit" variant="outline" className="w-full">
              <RefreshCw />
              {t("dispensing.update")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
