import type { MessageKey, Translate } from "@/i18n/messages";
import type { LabelSuggestion } from "./dosing";

/*
 * The text of a dispensing label from a LabelSuggestion, in the label's
 * language (Thai by default). Where a Thai cell of the sheet is empty, the
 * English one beside it is used. The pharmacist sees this as an editable
 * preview before printing.
 */

export type LabelLanguage = "en" | "th";

export type LabelText = {
  medicine: string;
  indication: string | null;
  /** Amount, how often and when, as one line each. */
  directions: string[];
  limits: string[];
  note: string | null;
  warnings: string[];
};

const UNIT_KEYS: Record<string, MessageKey> = {
  tablet: "drugLabel.unitTablet",
  capsule: "drugLabel.unitCapsule",
  ml: "drugLabel.unitMl",
  drop: "drugLabel.unitDrop",
  puff: "drugLabel.unitPuff",
  application: "drugLabel.unitApplication",
  lozenge: "drugLabel.unitLozenge",
  sachet: "drugLabel.unitSachet",
  suppository: "drugLabel.unitSuppository",
  pessary: "drugLabel.unitPessary",
  patch: "drugLabel.unitPatch",
  plaster: "drugLabel.unitPlaster",
  spray: "drugLabel.unitSpray",
  inhalation: "drugLabel.unitInhalation",
  actuation: "drugLabel.unitActuation",
  bottle: "drugLabel.unitBottle",
  ring: "drugLabel.unitRing",
  dose: "drugLabel.unitDose",
  g: "drugLabel.unitG",
  mg: "drugLabel.unitMg",
  mcg: "drugLabel.unitMcg",
};

const UNIT_PLURAL_KEYS: Record<string, MessageKey> = {
  tablet: "drugLabel.unitTablets",
  capsule: "drugLabel.unitCapsules",
  drop: "drugLabel.unitDrops",
  puff: "drugLabel.unitPuffs",
  application: "drugLabel.unitApplications",
  lozenge: "drugLabel.unitLozenges",
  sachet: "drugLabel.unitSachets",
  suppository: "drugLabel.unitSuppositories",
  pessary: "drugLabel.unitPessaries",
  patch: "drugLabel.unitPatches",
  plaster: "drugLabel.unitPlasters",
  spray: "drugLabel.unitSprays",
  inhalation: "drugLabel.unitInhalations",
  actuation: "drugLabel.unitActuations",
  bottle: "drugLabel.unitBottles",
  ring: "drugLabel.unitRings",
  dose: "drugLabel.unitDoses",
};

const TIMING_KEYS: Record<string, MessageKey> = {
  "before food": "drugLabel.timingBeforeFood",
  "after food": "drugLabel.timingAfterFood",
  "with food": "drugLabel.timingWithFood",
  "at bedtime": "drugLabel.timingBedtime",
  "in the morning": "drugLabel.timingMorning",
  "in the evening": "drugLabel.timingEvening",
  "in the morning before food": "drugLabel.timingMorningBeforeFood",
  "with the evening meal": "drugLabel.timingEveningMeal",
  "morning and evening": "drugLabel.timingMorningEvening",
  "at the same time each day": "drugLabel.timingSameTime",
};

/** 2.5 -> "2.5", 5 -> "5", 19.2 -> "19.2". */
const num = (n: number) => String(Math.round(n * 100) / 100);

function unitText(t: Translate, unit: string, amount: number): string {
  const key = unit.trim().toLowerCase().replace(/s$/, "");
  const plural = amount !== 1 ? UNIT_PLURAL_KEYS[key] : undefined;
  const k = plural ?? UNIT_KEYS[key];
  return k ? t(k) : unit;
}

function amountText(t: Translate, low: number, high: number, unit: string): string {
  const amount = low === high ? num(low) : t("drugLabel.range", { low: num(low), high: num(high) });
  return t("drugLabel.amount", { amount, unit: unitText(t, unit, high) });
}

const pick = (lang: LabelLanguage, en: string | null, th: string | null) =>
  (lang === "th" ? th || en : en || th) || null;

export function buildLabelText(s: LabelSuggestion, t: Translate, lang: LabelLanguage): LabelText {
  const gpu = s.gpu;
  const medicine = [s.product.tradeName, gpu?.strength, gpu?.dosageForm].filter(Boolean).join(" ");
  const warnings = s.warnings
    .map((w) => pick(lang, w.textEn, w.textTh))
    .filter((w): w is string => !!w);
  const d = s.directions;
  if (!d) return { medicine, indication: null, directions: [], limits: [], note: null, warnings };

  const directions = [amountText(t, d.amountLow, d.amountHigh, d.amountUnit)];
  const often: string[] = [];
  if (d.asNeeded) {
    often.push(
      d.intervalHoursMin
        ? t("drugLabel.everyHoursWhenNeeded", { hours: num(d.intervalHoursMin) })
        : t("drugLabel.whenNeeded"),
    );
    if (d.timesPerDayMax) often.push(t("drugLabel.atMostTimesADay", { count: num(d.timesPerDayMax) }));
  } else {
    if (d.timesPerDayMax) often.push(t("drugLabel.timesADay", { count: num(d.timesPerDayMax) }));
    if (d.intervalHoursMin) often.push(t("drugLabel.hoursApart", { hours: num(d.intervalHoursMin) }));
  }
  if (often.length) directions.push(often.join(t("drugLabel.joiner")));
  const timing = d.timing ? TIMING_KEYS[d.timing] : undefined;
  if (timing) directions.push(t(timing));

  const limits: string[] = [];
  // The daily maximum adds nothing when it equals the dose times a day.
  const byTimes = d.timesPerDayMax ? d.amountHigh * d.timesPerDayMax : null;
  if (d.maxPerDay !== null && (byTimes === null || d.maxPerDay < byTimes || d.source === "gpu")) {
    const unit = d.maxPerDayUnit || d.amountUnit;
    limits.push(t("drugLabel.maxPerDay", { amount: num(d.maxPerDay), unit: unitText(t, unit, d.maxPerDay) }));
  }
  if (d.maxDays) limits.push(t("drugLabel.maxDays", { days: num(d.maxDays) }));

  return {
    medicine,
    indication: pick(lang, d.indicationEn, d.indicationTh),
    directions,
    limits,
    note: pick(lang, d.noteEn, d.noteTh),
    warnings,
  };
}
