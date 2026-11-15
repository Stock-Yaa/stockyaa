import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DrugInfoCards } from "@/components/drug-info-card";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { getDb } from "@/db";
import { customers, products, saleItems, sales, users } from "@/db/schema";
import { createTranslator, getMessages, type MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { branchScope, inScope } from "@/lib/branches";
import { suggestLabel, type NoDirectionsReason, type Patient } from "@/lib/dosing";
import { loadDrugData, loadDrugInfo } from "@/lib/drug-database";
import { buildLabelText, type LabelLanguage } from "@/lib/drug-label";
import { createFormat } from "@/lib/format";
import { pageTitle } from "@/lib/metadata";
import { requiredId } from "@/lib/validation";
import { LabelSheet, type LabelDraft } from "./label-sheet";

export const generateMetadata = pageTitle("dispensing.title");

/** Pharmacist-facing reason when a linked medicine gets no suggestion. */
function reasonKey(reason: NoDirectionsReason | null): MessageKey {
  switch (reason) {
    case "needsAge":
      return "dispensing.reasonNeedsAge";
    case "needsWeight":
      return "dispensing.reasonNeedsWeight";
    case "noRowFits":
      return "dispensing.reasonNoRowFits";
    case "roundingOff":
      return "dispensing.reasonRoundingOff";
    case "rowsTie":
      return "dispensing.reasonTie";
    case "gpuNotApproved":
    case "rowNotApproved":
      return "dispensing.noSuggestion";
    default:
      return "dispensing.reasonNoData";
  }
}

const wholeNumber = (v: string) => (/^\d{1,3}$/.test(v.trim()) ? Number(v) : null);

export default async function SaleLabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, pharmacy, branch } = await requirePharmacy();
  const { id } = await params;
  if (!requiredId.safeParse(id).success) notFound();
  const sp = await searchParams;
  const param = (key: string) => {
    const v = sp[key];
    return ((Array.isArray(v) ? v[0] : v) ?? "").slice(0, 200);
  };
  const [t, db] = await Promise.all([getT(), getDb()]);

  // The sale must belong to the current branch, like its receipt.
  const [row] = await db
    .select({ sale: sales, customerName: customers.name, cashierName: users.name })
    .from(sales)
    .leftJoin(customers, and(eq(sales.customerId, customers.id), eq(customers.pharmacyId, pharmacy.id)))
    .leftJoin(users, and(eq(sales.userId, users.id), eq(users.pharmacyId, pharmacy.id)))
    .where(and(eq(sales.id, id), inScope(sales, branchScope(branch))))
    .limit(1);
  if (!row) notFound();
  const { sale } = row;

  const itemRows = await db
    .select({
      productId: saleItems.productId,
      productName: saleItems.productName,
      quantity: saleItems.quantity,
      unit: products.unit,
      tpuId: products.tpuId,
      requiresPrescription: products.requiresPrescription,
    })
    .from(saleItems)
    .leftJoin(products, and(eq(products.id, saleItems.productId), eq(products.pharmacyId, pharmacy.id)))
    .where(eq(saleItems.saleId, sale.id))
    .orderBy(asc(saleItems.productName), asc(saleItems.id));
  // One label per product, even when it was sold from several batches.
  const items = new Map<string, (typeof itemRows)[number]>();
  for (const item of itemRows) {
    const seen = items.get(item.productId);
    if (seen) seen.quantity += item.quantity;
    else items.set(item.productId, { ...item });
  }

  // The patient, from the form at the top (a GET form, so the URL keeps it).
  const group: Patient["group"] = param("group") === "child" ? "child" : "adult";
  const years = wholeNumber(param("years"));
  const months = wholeNumber(param("months"));
  const ageMonths = years === null && months === null ? null : (years ?? 0) * 12 + (months ?? 0);
  const weightValue = Number(param("weight").replace(",", "."));
  const weightKg = param("weight").trim() && weightValue > 0 && weightValue < 500 ? weightValue : null;
  const patient: Patient = { group, ageMonths, weightKg };
  const lang: LabelLanguage = param("lang") === "en" ? "en" : "th";
  const patientName = sp.patient === undefined ? (row.customerName ?? "") : param("patient");
  const pharmacist = sp.pharmacist === undefined ? (row.cashierName ?? user.name) : param("pharmacist");

  const labelT = createTranslator(getMessages(lang));
  const labelFormat = createFormat(lang, pharmacy.currency, pharmacy.timezone);
  const link = (patch: Record<string, string>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const value = Array.isArray(v) ? v[0] : v;
      if (value) qs.set(k, value);
    }
    for (const [k, v] of Object.entries(patch)) qs.set(k, v);
    return `?${qs.toString()}`;
  };

  const drafts: LabelDraft[] = [];
  for (const item of items.values()) {
    const quantity = `${item.quantity} ${item.unit ?? ""}`.trim();
    const data = item.tpuId !== null ? await loadDrugData(db, item.tpuId) : null;
    if (!data) {
      drafts.push({
        key: item.productId,
        include: item.requiresPrescription === true,
        medicine: item.productName,
        quantity,
        indication: "",
        directions: "",
        warnings: "",
        status: t("dispensing.notLinked"),
        suggested: false,
      });
      continue;
    }
    const indParam = param(`ind_${item.productId}`);
    const s = suggestLabel(data, patient, {
      indication: /^\d+$/.test(indParam) ? Number(indParam) : undefined,
    });
    const text = buildLabelText(s, labelT, lang);
    const info = (
      await loadDrugInfo(db, [...new Set(data.ingredients.map((i) => i.ingredient))], s.gpu?.route ?? null)
    ).filter((r) => r.approved);
    const choices =
      s.indicationChoices.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {s.indicationChoices.map((c, i) => (
            <Link
              key={i}
              href={link({ [`ind_${item.productId}`]: String(i) })}
              className={buttonClass({ variant: indParam === String(i) ? "primary" : "outline", size: "sm" })}
            >
              {(lang === "th" ? c.indicationTh || c.indicationEn : c.indicationEn || c.indicationTh) || `#${i + 1}`}
            </Link>
          ))}
        </div>
      ) : null;
    drafts.push({
      key: item.productId,
      include: true,
      medicine: text.medicine,
      quantity,
      indication: text.indication ?? "",
      directions: [...text.directions, ...text.limits, ...(text.note ? [text.note] : [])].join("\n"),
      warnings: text.warnings.join("\n"),
      status: s.directions
        ? t("dispensing.suggested")
        : s.indicationChoices.length > 0 && !s.directions
          ? t("dispensing.chooseIndication")
          : t(reasonKey(s.reason)),
      suggested: s.directions !== null,
      choices,
      info: info.length > 0 ? <DrugInfoCards rows={info} lang={lang} /> : undefined,
    });
  }

  const sheetKey = JSON.stringify(sp);

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={t("dispensing.title")}
          description={t("dispensing.description", { invoice: sale.invoiceNumber })}
        >
          <Link href={`/sales/${sale.id}`} className={buttonClass({ variant: "ghost" })}>
            <ArrowLeft />
            {t("dispensing.back")}
          </Link>
        </PageHeader>

        <Card className="mb-6">
          <CardContent>
            <form method="get" className="grid gap-4 sm:grid-cols-6">
              <Field label={t("dispensing.patientName")} htmlFor="label-patient" className="sm:col-span-3">
                <Input id="label-patient" name="patient" defaultValue={patientName} maxLength={100} />
              </Field>
              <Field label={t("dispensing.pharmacist")} htmlFor="label-pharmacist" className="sm:col-span-3">
                <Input id="label-pharmacist" name="pharmacist" defaultValue={pharmacist} maxLength={100} />
              </Field>
              <Field label={t("dispensing.group")} htmlFor="label-group" className="sm:col-span-2">
                <Select id="label-group" name="group" defaultValue={group}>
                  <option value="adult">{t("dispensing.adult")}</option>
                  <option value="child">{t("dispensing.child")}</option>
                </Select>
              </Field>
              <Field label={t("dispensing.ageYears")} htmlFor="label-years">
                <Input id="label-years" name="years" type="number" min={0} max={120} inputMode="numeric" defaultValue={param("years")} />
              </Field>
              <Field label={t("dispensing.ageMonths")} htmlFor="label-months">
                <Input id="label-months" name="months" type="number" min={0} max={11} inputMode="numeric" defaultValue={param("months")} />
              </Field>
              <Field label={t("dispensing.weight")} htmlFor="label-weight" hint={t("dispensing.weightHint")} className="sm:col-span-2">
                <Input id="label-weight" name="weight" type="number" min={0} step="0.1" inputMode="decimal" defaultValue={param("weight")} />
              </Field>
              <Field label={t("dispensing.labelLanguage")} htmlFor="label-lang" className="sm:col-span-2">
                <Select id="label-lang" name="lang" defaultValue={lang}>
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
      </div>

      {drafts.length === 0 ? (
        <EmptyState title={t("dispensing.noItems")} />
      ) : (
        <LabelSheet
          key={sheetKey}
          drafts={drafts}
          header={{
            pharmacyName: pharmacy.name,
            phone: branch.phone || pharmacy.phone || "",
            date: labelFormat.date(sale.createdAt),
            patientName,
            pharmacist,
          }}
          captions={{
            patient: labelT("drugLabel.captionPatient"),
            date: labelT("drugLabel.captionDate"),
            quantity: labelT("drugLabel.captionQuantity"),
            pharmacist: labelT("drugLabel.captionPharmacist"),
            indication: labelT("drugLabel.captionFor"),
          }}
        />
      )}
    </>
  );
}
