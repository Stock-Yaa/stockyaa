import { EmptyState } from "@/components/ui/page";
import { getDb } from "@/db";
import { createTranslator, getMessages } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { labelDate, labelSize, licenseNumber, stickerWords } from "@/lib/label-layout";
import { buildLabelDrafts, licensedPharmacists, type LabelItem } from "./build";
import { LabelWorkspace } from "./label-workspace";
import { PatientForm, readPatientParams } from "./patient-form";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The dispensing labels of a sale or of a POS cart: the patient form, then
 * one editable label per product with its preview, then printing.
 */
export async function LabelsView({
  searchParams,
  items,
  saleId,
  date,
  defaultPatientName,
  hidden,
}: {
  searchParams: SearchParams;
  items: LabelItem[];
  /** The sale, or null for a cart printed before the sale is completed. */
  saleId: string | null;
  date: Date;
  defaultPatientName: string;
  /** Parameters the patient form keeps (the POS cart). */
  hidden?: Record<string, string>;
}) {
  const { user, pharmacy, branch } = await requirePharmacy();
  const [t, db] = await Promise.all([getT(), getDb()]);
  const param = (key: string) => {
    const v = searchParams[key];
    return ((Array.isArray(v) ? v[0] : v) ?? "").slice(0, 200);
  };
  const has = (key: string) => searchParams[key] !== undefined;

  const pharmacists = await licensedPharmacists(db, pharmacy.id);
  const values = readPatientParams(param, has, {
    patientName: defaultPatientName,
    pharmacistId: pharmacists.some((p) => p.id === user.id) ? user.id : null,
  });
  const pharmacist = pharmacists.find((p) => p.id === values.pharmacistId) ?? null;

  const link = (patch: Record<string, string>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      const value = Array.isArray(v) ? v[0] : v;
      if (value) qs.set(k, value);
    }
    for (const [k, v] of Object.entries(patch)) qs.set(k, v);
    return `?${qs.toString()}`;
  };

  const drafts = await buildLabelDrafts({
    db,
    pharmacyId: pharmacy.id,
    items,
    patient: values.patient,
    lang: values.lang,
    param,
    link,
    t,
  });
  const labelT = createTranslator(getMessages(values.lang));

  return (
    <>
      <PatientForm values={values} pharmacists={pharmacists} hidden={hidden} />
      {drafts.length === 0 ? (
        <EmptyState title={t("dispensing.noItems")} />
      ) : (
        <LabelWorkspace
          key={JSON.stringify(searchParams)}
          drafts={drafts}
          common={{
            language: values.lang,
            pharmacyName: pharmacy.name,
            pharmacyAddress: branch.address || pharmacy.address || "",
            pharmacyPhone: branch.phone || pharmacy.phone || "",
            logo: pharmacy.labelLogo,
            patientName: values.patientName,
            date: labelDate(date, values.lang, pharmacy.timezone),
            pharmacistId: pharmacist?.id ?? null,
            pharmacistName: pharmacist?.name ?? "",
            pharmacistLicense: licenseNumber(pharmacist?.license),
          }}
          size={labelSize(pharmacy)}
          words={stickerWords(labelT)}
          record={{ branchId: branch.id, saleId }}
        />
      )}
    </>
  );
}
