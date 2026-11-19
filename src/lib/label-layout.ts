import type { LABEL_LANGUAGES, LABEL_PRESETS } from "@/db/schema";
import type { Translate } from "@/i18n/messages";
import type { Directions } from "./dosing";

/*
 * The dispensing label as printed: what it must contain (Thai GPP, clause 16
 * of the 2014 Ministry of Public Health notification), the sticker presets and
 * the time-of-day boxes. From the client's label design of 17 November 2026
 * (stockyaa-label-design-spec.md). Pure, shared by the label pages, the
 * settings preview and the tests.
 */

export type LabelPreset = (typeof LABEL_PRESETS)[number];
export type LayoutPreset = Exclude<LabelPreset, "custom">;
export type LabelLanguage = (typeof LABEL_LANGUAGES)[number];

export type PresetSpec = {
  widthMm: number;
  heightMm: number;
  /** Two columns (patient and drug left, directions right) or one. */
  columns: boolean;
  logo: boolean;
  /** Thai name of the drug in brackets on a Thai label. */
  thaiName: boolean;
  /** Icons in the time-of-day boxes; without them only the used slots show. */
  icons: boolean;
  /** Warnings printed on the sticker. */
  warnings: number;
};

export const PRESET_SPECS: Record<LayoutPreset, PresetSpec> = {
  standard: { widthMm: 80, heightMm: 50, columns: true, logo: true, thaiName: true, icons: true, warnings: 2 },
  compact: { widthMm: 70, heightMm: 50, columns: false, logo: false, thaiName: false, icons: false, warnings: 1 },
  large: { widthMm: 80, heightMm: 80, columns: false, logo: true, thaiName: true, icons: true, warnings: 2 },
  xl: { widthMm: 100, heightMm: 75, columns: false, logo: true, thaiName: true, icons: true, warnings: 2 },
};

/** The smallest custom sticker. */
export const MIN_LABEL_MM = { width: 70, height: 50 };
export const MAX_LABEL_MM = { width: 150, height: 150 };

export type LabelSize = {
  preset: LabelPreset;
  /** The preset whose layout is used (a custom size takes the nearest). */
  layout: LayoutPreset;
  widthMm: number;
  heightMm: number;
  rotate: boolean;
};

/** The pharmacy's sticker: its preset, or a custom size with the nearest layout. */
export function labelSize(settings: {
  labelPreset: LabelPreset;
  labelWidthMm: number | null;
  labelHeightMm: number | null;
  labelRotate: boolean;
}): LabelSize {
  const rotate = settings.labelRotate;
  if (settings.labelPreset !== "custom" || !settings.labelWidthMm || !settings.labelHeightMm) {
    const layout = settings.labelPreset === "custom" ? "standard" : settings.labelPreset;
    const spec = PRESET_SPECS[layout];
    return { preset: layout, layout, widthMm: spec.widthMm, heightMm: spec.heightMm, rotate };
  }
  const w = settings.labelWidthMm;
  const h = settings.labelHeightMm;
  // The nearest preset; on a tie the smaller one, which surely fits (7.5 × 5 is compact).
  const distance = (k: LayoutPreset) => Math.abs(PRESET_SPECS[k].widthMm - w) + Math.abs(PRESET_SPECS[k].heightMm - h);
  const area = (k: LayoutPreset) => PRESET_SPECS[k].widthMm * PRESET_SPECS[k].heightMm;
  const layout = (Object.keys(PRESET_SPECS) as LayoutPreset[]).reduce((best, key) =>
    distance(key) < distance(best) || (distance(key) === distance(best) && area(key) < area(best)) ? key : best,
  );
  return { preset: "custom", layout, widthMm: w, heightMm: h, rotate };
}

// ---------------------------------------------------------------------------
// Time-of-day boxes
// ---------------------------------------------------------------------------

export const SLOTS = ["morning", "noon", "evening", "bedtime"] as const;
export type Slot = (typeof SLOTS)[number];
/** Units to take at each time of day; null = not at that time. */
export type Slots = Record<Slot, string | null>;

const EMPTY_SLOTS: Slots = { morning: null, noon: null, evening: null, bedtime: null };

const amountText = (low: number, high: number) => {
  // Halves as the box shows them: 0.5 -> "½", 1.5 -> "1½".
  const n = (v: number) => {
    const whole = Math.floor(v);
    if (Number.isInteger(v * 2) && !Number.isInteger(v)) return whole === 0 ? "½" : `${whole}½`;
    return String(Math.round(v * 100) / 100);
  };
  return low === high ? n(low) : `${n(low)}–${n(high)}`;
};

/**
 * The boxes for suggested directions, or null when the schedule does not fit
 * them: taken when needed, by interval ("every 6 hours", no times a day), more
 * than 4 times a day, or not a whole number of times. Never forced.
 * 1 = morning (bedtime or evening when the row says so), 2 = morning and
 * evening, 3 = morning, noon, evening, 4 = all four.
 */
export function defaultSlots(d: Directions | null): Slots | null {
  if (!d || d.asNeeded) return null;
  const times = d.timesPerDayMax;
  if (times === null || !Number.isInteger(times) || times < 1 || times > 4) return null;
  const amount = amountText(d.amountLow, d.amountHigh);
  const pick = (...slots: Slot[]): Slots => ({
    ...EMPTY_SLOTS,
    ...Object.fromEntries(slots.map((s) => [s, amount])),
  });
  if (times === 1) {
    if (d.timing === "at bedtime") return pick("bedtime");
    if (d.timing === "in the evening" || d.timing === "with the evening meal") return pick("evening");
    return pick("morning");
  }
  if (times === 2) return pick("morning", "evening");
  if (times === 3) return pick("morning", "noon", "evening");
  return pick("morning", "noon", "evening", "bedtime");
}

export const hasSlots = (slots: Slots | null): slots is Slots =>
  slots !== null && SLOTS.some((s) => slots[s] !== null && slots[s] !== "");

// ---------------------------------------------------------------------------
// Content and the legal checks
// ---------------------------------------------------------------------------

export type LabelWarning = { text: string; mustPrint: boolean };

/** Everything printed on one label, in its one language. */
export type LabelContent = {
  language: LabelLanguage;
  pharmacyName: string;
  pharmacyAddress: string;
  pharmacyPhone: string;
  logo: string | null;
  patientName: string;
  date: string;
  /** Generic (or brand) name, in English. */
  drugName: string;
  strength: string;
  /** The product has no strength (a dressing, a device): strength not required. */
  noStrength: boolean;
  /** Thai name, in brackets after the drug on a Thai label. */
  thaiName: string | null;
  quantity: string;
  indication: string;
  /** First line is the main direction (largest type); the rest follow smaller. */
  directions: string;
  slots: Slots | null;
  warnings: LabelWarning[];
  pharmacistName: string;
  pharmacistLicense: string;
};

/** The ten required items (clause 16), as the fields that hold them. */
export const REQUIRED_ITEMS = [
  "pharmacyName",
  "pharmacyAddress",
  "pharmacyPhone",
  "patientName",
  "drugName",
  "strength",
  "quantity",
  "indication",
  "directions",
  "pharmacistName",
  "pharmacistLicense",
] as const;
export type RequiredItem = (typeof REQUIRED_ITEMS)[number];

/** Required items that are empty: printing is blocked until they are filled. */
export function missingItems(c: LabelContent): RequiredItem[] {
  return REQUIRED_ITEMS.filter((item) => {
    if (item === "strength" && c.noStrength) return false;
    return !String(c[item] ?? "").trim();
  });
}

/**
 * Which warnings go on the sticker and which need a second sticker. Warnings
 * that must be printed come first; the sticker takes up to `limit`; any
 * must-print warning left over goes on a second sticker, the others are not
 * printed (and the pharmacist is told).
 */
export function placeWarnings(warnings: LabelWarning[], limit: number) {
  const ordered = [...warnings.filter((w) => w.mustPrint), ...warnings.filter((w) => !w.mustPrint)];
  const onLabel = ordered.slice(0, limit);
  const rest = ordered.slice(limit);
  return {
    onLabel,
    secondSticker: rest.filter((w) => w.mustPrint),
    dropped: rest.filter((w) => !w.mustPrint),
  };
}

/** Thai label dates use the Buddhist year (17 พ.ย. 2569), English 17 Nov 2026. */
export function labelDate(date: Date, language: LabelLanguage, timeZone: string): string {
  const tag = language === "th" ? "th-TH-u-ca-buddhist" : "en-GB";
  return new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", year: "numeric", timeZone }).format(date);
}

/** "paracetamol + caffeine" -> "Paracetamol + Caffeine". */
export const titleCaseIngredients = (name: string) =>
  name
    .split(/(\s*\+\s*)/)
    .map((part) => (part.trim() === "+" ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");

/** Words printed on the sticker, in the label's language. */
export type StickerWords = {
  slots: Record<Slot, string>;
  quantity: string;
  usedFor: string;
  licensePrefix: string;
  signature: string;
};

/** The sticker's words from a translator for the label's language. */
export function stickerWords(t: Translate): StickerWords {
  return {
    slots: {
      morning: t("drugLabel.slotMorning"),
      noon: t("drugLabel.slotNoon"),
      evening: t("drugLabel.slotEvening"),
      bedtime: t("drugLabel.slotBedtime"),
    },
    quantity: t("drugLabel.stickerQuantity"),
    usedFor: t("drugLabel.stickerUsedFor"),
    licensePrefix: t("drugLabel.licensePrefix"),
    signature: t("drugLabel.signature"),
  };
}

/** "ภ.12345", "ภ 12345" or "Lic. 12345" -> "12345": the label adds its own prefix. */
export const licenseNumber = (value: string | null | undefined) =>
  (value ?? "").trim().replace(/^(ภ\.?|lic\.?)\s*/i, "");
