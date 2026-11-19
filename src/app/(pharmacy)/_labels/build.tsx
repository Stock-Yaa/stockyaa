import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { DrugInfoCards } from "@/components/drug-info-card";
import { buttonClass } from "@/components/ui/button";
import type { Db } from "@/db";
import { products, users } from "@/db/schema";
import { createTranslator, getMessages, type MessageKey, type Translate } from "@/i18n/messages";
import { suggestLabel, type NoDirectionsReason, type Patient } from "@/lib/dosing";
import { loadDrugData, loadDrugInfo } from "@/lib/drug-database";
import { buildLabelText } from "@/lib/drug-label";
import {
  defaultSlots,
  titleCaseIngredients,
  type LabelLanguage,
  type LabelWarning,
  type Slots,
} from "@/lib/label-layout";

/*
 * Builds the dispensing labels of a sale, or of a POS cart before the sale is
 * completed, in one language: one draft per product, pre-filled from the drug
 * database when the product is linked to TMT. Shared by /sales/[id]/labels
 * and /pos/labels.
 */

export type LabelItem = { productId: string; quantity: number };

/** One label as first suggested; the pharmacist edits it before printing. */
export type LabelDraft = {
  key: string;
  productId: string;
  include: boolean;
  drugName: string;
  strength: string;
  noStrength: boolean;
  thaiName: string | null;
  quantity: string;
  indication: string;
  directions: string;
  /** Null when the schedule does not fit the boxes (or nothing is suggested). */
  slots: Slots | null;
  warnings: LabelWarning[];
  /** Texts of the database missing in the label's language (blocks printing until fixed). */
  missingText: string[];
  /** Where the directions came from, or why there are none. */
  status: string;
  suggested: boolean;
  /** The dose row's note: shown to the pharmacist, never printed. */
  note?: string;
  /** Something the pharmacist should know about the suggestion (the dose was capped). */
  notice?: string;
  /** Buttons to pick what the medicine is for (server-rendered links). */
  choices?: React.ReactNode;
  /** The ingredients' drug information cards (server-rendered). */
  info?: React.ReactNode;
  /** The Thai suggestion, kept with the record when the label is printed in English. */
  thai?: Record<string, unknown>;
};

/** Pharmacist-facing reason when a linked medicine gets no suggestion. */
function reasonKey(reason: NoDirectionsReason | null): MessageKey {
  switch (reason) {
    case "needsGroup":
      return "dispensing.reasonNeedsGroup";
    case "exceedsDailyMax":
      return "dispensing.reasonCheckDose";
    case "implausibleAmount":
      return "dispensing.reasonImplausible";
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

/** The direction lines of the design: the amount, then how often and when, then limits. */
function directionLines(text: ReturnType<typeof buildLabelText>, joiner: string): string[] {
  const [amount, ...rest] = text.directions;
  if (!amount) return [];
  const second = rest.join(joiner);
  return [amount, ...(second ? [second] : []), ...text.limits];
}

export async function buildLabelDrafts({
  db,
  pharmacyId,
  items,
  patient,
  lang,
  param,
  link,
  t,
}: {
  db: Db;
  pharmacyId: string;
  items: LabelItem[];
  patient: Patient;
  lang: LabelLanguage;
  /** Reads a URL parameter (the chosen indication of each product). */
  param: (key: string) => string;
  link: (patch: Record<string, string>) => string;
  t: Translate;
}): Promise<LabelDraft[]> {
  const labelT = createTranslator(getMessages(lang));
  const thaiT = createTranslator(getMessages("th"));
  const ids = [...new Set(items.map((i) => i.productId))];
  const rows = ids.length
    ? await db
        .select({
          id: products.id,
          name: products.name,
          genericName: products.genericName,
          strength: products.strength,
          unit: products.unit,
          tpuId: products.tpuId,
          requiresPrescription: products.requiresPrescription,
        })
        .from(products)
        .where(and(eq(products.pharmacyId, pharmacyId), inArray(products.id, ids)))
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));

  // One label per product, even when it was sold from several batches.
  const quantities = new Map<string, number>();
  for (const item of items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);

  const drafts: LabelDraft[] = [];
  for (const [productId, qty] of quantities) {
    const product = byId.get(productId);
    if (!product) continue;
    const quantity = `${qty} ${product.unit}`.trim();
    const data = product.tpuId !== null ? await loadDrugData(db, product.tpuId) : null;
    if (!data) {
      drafts.push({
        key: productId,
        productId,
        include: product.requiresPrescription,
        drugName: product.genericName || product.name,
        strength: product.strength ?? "",
        noStrength: false,
        thaiName: null,
        quantity,
        indication: "",
        directions: "",
        slots: null,
        warnings: [],
        missingText: [],
        status: t("dispensing.notLinked"),
        suggested: false,
      });
      continue;
    }

    const indParam = param(`ind_${productId}`);
    // The chosen indication, by its sheet row. Sending the patient form again
    // drops it, so a new age or weight never keeps an old choice.
    const s = suggestLabel(data, patient, {
      indicationRow: /^\d{1,7}$/.test(indParam) ? Number(indParam) : undefined,
    });
    const text = buildLabelText(s, labelT, lang);
    const d = s.directions;
    const gpu = s.gpu;
    const ingredients = [...new Set(data.ingredients.map((i) => i.ingredient))];
    const info = (await loadDrugInfo(db, ingredients, gpu?.route ?? null)).filter((r) => r.approved);
    const thaiNames = ingredients.map((i) => info.find((r) => r.ingredient === i)?.nameTh).filter(Boolean);
    const thaiName = thaiNames.length === ingredients.length && thaiNames.length > 0 ? thaiNames.join(" + ") : null;

    // One language per label: a text the database lacks in it is reported,
    // never filled from the other language.
    const missingText: string[] = [];
    const indication = d ? (lang === "th" ? d.indicationTh : d.indicationEn) : null;
    if (d && !indication && (d.indicationEn || d.indicationTh)) missingText.push(t("dispensing.missingIndication"));
    const warnings: LabelWarning[] = [];
    for (const w of s.warnings) {
      const textInLang = lang === "th" ? w.textTh : w.textEn;
      if (textInLang) warnings.push({ text: textInLang, mustPrint: w.mustPrint });
      else missingText.push(t("dispensing.missingWarning", { code: w.code }));
    }
    const note = d ? (lang === "th" ? d.noteTh || d.noteEn : d.noteEn || d.noteTh) : null;

    const choices =
      s.indicationChoices.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {s.indicationChoices.map((c) => (
            <Link
              key={c.sheetRow}
              href={link({ [`ind_${productId}`]: String(c.sheetRow) })}
              className={buttonClass({ variant: indParam === String(c.sheetRow) ? "primary" : "outline", size: "sm" })}
            >
              {(lang === "th" ? c.indicationTh || c.indicationEn : c.indicationEn || c.indicationTh) || `#${c.sheetRow}`}
            </Link>
          ))}
        </div>
      ) : undefined;

    const thaiText = lang === "en" && d ? buildLabelText(s, thaiT, "th") : null;
    drafts.push({
      key: productId,
      productId,
      include: true,
      drugName: gpu?.activeIngredient ? titleCaseIngredients(gpu.activeIngredient) : product.genericName || product.name,
      strength: gpu?.strength ?? product.strength ?? "",
      noStrength: !!gpu && !gpu.strength,
      thaiName,
      quantity,
      indication: indication ?? "",
      directions: directionLines(text, labelT("drugLabel.joiner")).join("\n"),
      slots: defaultSlots(d),
      warnings,
      missingText,
      status: d
        ? t("dispensing.suggested")
        : s.indicationChoices.length > 0 && s.reason === null
          ? t("dispensing.chooseIndication")
          : t(reasonKey(s.reason)),
      suggested: d !== null,
      note: note ?? undefined,
      notice: d?.cappedAtDailyMax ? t("dispensing.cappedAtDailyMax") : undefined,
      choices,
      info: info.length > 0 ? <DrugInfoCards rows={info} lang={lang} /> : undefined,
      thai: thaiText
        ? {
            indication: d?.indicationTh ?? null,
            directions: directionLines(thaiText, thaiT("drugLabel.joiner")),
            warnings: s.warnings.map((w) => w.textTh).filter(Boolean),
          }
        : undefined,
    });
  }
  return drafts;
}

/** Users of the pharmacy who can be named on a label: active, with a licence number. */
export async function licensedPharmacists(db: Db, pharmacyId: string) {
  const rows = await db
    .select({ id: users.id, name: users.name, license: users.pharmacistLicense })
    .from(users)
    .where(and(eq(users.pharmacyId, pharmacyId), eq(users.isActive, true)));
  return rows
    .filter((r): r is { id: string; name: string; license: string } => !!r.license?.trim())
    .sort((a, b) => a.name.localeCompare(b.name));
}
