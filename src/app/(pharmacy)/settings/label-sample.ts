import type { Branch, Pharmacy } from "@/db/schema";
import type { Translate } from "@/i18n/messages";
import { labelDate, type LabelContent, type LabelLanguage } from "@/lib/label-layout";

/**
 * A sample label with the pharmacy's own name, address and phone, for the
 * settings preview and the test print. The medicine is sample data.
 */
export function sampleLabel(
  t: Translate,
  pharmacy: Pharmacy,
  branch: Branch,
  language: LabelLanguage,
  date: Date,
): LabelContent {
  return {
    language,
    pharmacyName: pharmacy.name,
    pharmacyAddress: branch.address || pharmacy.address || t("settings.labelSampleAddress"),
    pharmacyPhone: branch.phone || pharmacy.phone || t("settings.labelSamplePhone"),
    logo: pharmacy.labelLogo,
    patientName: t("settings.labelSamplePatient"),
    date: labelDate(date, language, pharmacy.timezone),
    drugName: "Amoxicillin",
    strength: "500 mg",
    noStrength: false,
    thaiName: language === "th" ? "อะม็อกซีซิลลิน" : null,
    quantity: t("settings.labelSampleQuantity"),
    indication: t("settings.labelSampleIndication"),
    directions: `${t("settings.labelSampleDirection")}\n${t("settings.labelSampleDirection2")}`,
    slots: { morning: "1", noon: "1", evening: "1", bedtime: null },
    warnings: [
      { text: t("settings.labelSampleWarning"), mustPrint: false },
      { text: t("settings.labelSampleWarning2"), mustPrint: false },
    ],
    pharmacistName: t("settings.labelSamplePharmacist"),
    pharmacistLicense: "00000",
  };
}
