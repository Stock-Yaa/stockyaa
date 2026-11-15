import type {
  drugDosing,
  drugGpuIngredients,
  drugGpus,
  drugTmtProducts,
  drugWarningLabels,
} from "@/db/schema";

/*
 * Works out the directions for a dispensing label from the drug database,
 * following the client's "How to use the drug file for dosing and labels"
 * (14 November 2026): product (tpu_id) -> GPU -> ingredient -> dose rule.
 *
 * Pure: the caller loads the rows (src/lib/drug-database.ts). When anything
 * is missing, unclear or not approved, the result has no directions and a
 * reason; the label still shows the medicine and the pharmacist types the
 * directions. It never fills a gap with a guess.
 */

export type TmtProductRow = typeof drugTmtProducts.$inferSelect;
export type GpuRow = typeof drugGpus.$inferSelect;
export type GpuIngredientRow = typeof drugGpuIngredients.$inferSelect;
export type DosingRow = typeof drugDosing.$inferSelect;
export type WarningLabelRow = typeof drugWarningLabels.$inferSelect;

export type Patient = {
  group: "adult" | "child";
  /** Age in whole months; required for a child. */
  ageMonths: number | null;
  weightKg: number | null;
};

export type DrugData = {
  product: TmtProductRow;
  gpuRows: GpuRow[];
  ingredients: GpuIngredientRow[];
  /** Dosing rows for the ingredient (any route); the engine filters them. */
  dosingRows: DosingRow[];
  warningLabels: WarningLabelRow[];
};

export type NoDirectionsReason =
  | "noGpu"
  | "gpuNotApproved"
  | "noDoseMode"
  | "needsAge"
  | "noRowFits"
  | "rowsTie"
  | "rowNotApproved"
  | "rowHasErrors"
  | "needsWeight"
  | "noDosePeriod"
  | "noTimesPerDay"
  | "ruleNeedsOneIngredient"
  | "noLeadIngredient"
  | "noStrength"
  | "unitMismatch"
  | "noRoundTo"
  | "roundingOff"
  | "noAmount";

export type Directions = {
  source: "gpu" | "dosing";
  /** Sheet row the directions come from (GPU or Dosing tab). */
  sheetRow: number;
  indicationEn: string | null;
  indicationTh: string | null;
  amountLow: number;
  amountHigh: number;
  amountUnit: string;
  timesPerDayMax: number | null;
  intervalHoursMin: number | null;
  asNeeded: boolean;
  timing: string | null;
  maxPerDay: number | null;
  maxPerDayUnit: string | null;
  maxDays: number | null;
  noteEn: string | null;
  noteTh: string | null;
  /** How a rule or lead amount was worked out, for the pharmacist to check. */
  calculation: {
    ingredient: string;
    doseLow: number;
    doseHigh: number;
    doseUnit: string;
    strength: string | null;
    exactLow: number;
    exactHigh: number;
  } | null;
};

export type IndicationChoice = { indicationEn: string | null; indicationTh: string | null };

export type LabelSuggestion = {
  product: TmtProductRow;
  /** The GPU row whose shared columns are used (strength, form, route, …). */
  gpu: GpuRow | null;
  doseMode: string | null;
  directions: Directions | null;
  reason: NoDirectionsReason | null;
  /** Set when fitting Dosing rows differ only by indication: pick one with `indication`. */
  indicationChoices: IndicationChoice[];
  warnings: WarningLabelRow[];
  /** True when test mode let an unapproved row through. */
  usedUnapproved: boolean;
};

export type SuggestOptions = {
  /** Test mode: treat every row as approved. Never for a real label. */
  includeUnapproved?: boolean;
  /** Index into indicationChoices, once the pharmacist has picked one. */
  indication?: number;
};

const MAX_ROUNDING_CHANGE = 0.15;

/** Doses already counted in the unit given; no strength conversion. */
const COUNT_UNITS = new Set(["drop", "drops", "puff", "puffs", "application", "applications", "dose", "doses"]);

/** Forms whose dose may come only from a rule that names the form. */
const RELEASE_FORM = /prolonged-release|modified-release/;

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Units with a fixed ratio, as factor to a base unit. */
const UNIT_FACTORS: Record<string, { base: string; factor: number }> = {
  g: { base: "mass", factor: 1000 },
  mg: { base: "mass", factor: 1 },
  mcg: { base: "mass", factor: 0.001 },
  "µg": { base: "mass", factor: 0.001 },
  ug: { base: "mass", factor: 0.001 },
  l: { base: "volume", factor: 1000 },
  ml: { base: "volume", factor: 1 },
  mcl: { base: "volume", factor: 0.001 },
};

/** `value` in unit `from`, expressed in unit `to`; null when they do not convert. */
export function convertUnit(value: number, from: string, to: string): number | null {
  const a = norm(from);
  const b = norm(to);
  if (a === b) return value;
  const fa = UNIT_FACTORS[a];
  const fb = UNIT_FACTORS[b];
  if (!fa || !fb || fa.base !== fb.base) return null;
  return (value * fa.factor) / fb.factor;
}

const inRange = (value: number | null, min: number | null, max: number | null) =>
  value === null ? min === null && max === null : (min === null || value >= min) && (max === null || value <= max);

type Banded = {
  patientGroup: string | null;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  minWeightKg: number | null;
  maxWeightKg: number | null;
};

const hasWeightRange = (r: Banded) => r.minWeightKg !== null || r.maxWeightKg !== null;
const hasAgeRange = (r: Banded) => r.minAgeMonths !== null || r.maxAgeMonths !== null;

/**
 * Whether a row fits the patient: same group, age and weight inside the
 * row's ranges (both ends included, an empty end is no limit). An adult whose
 * age was not given fits any adult age range. A row with a weight range needs
 * the weight. A child row with neither an age nor a weight range never fits.
 */
function fits(row: Banded, patient: Patient): boolean {
  if (norm(row.patientGroup) !== patient.group) return false;
  if (patient.group === "child" && !hasAgeRange(row) && !hasWeightRange(row)) return false;
  if (hasAgeRange(row)) {
    if (patient.ageMonths === null) {
      if (patient.group === "child") return false;
    } else if (!inRange(patient.ageMonths, row.minAgeMonths, row.maxAgeMonths)) {
      return false;
    }
  }
  if (hasWeightRange(row) && !inRange(patient.weightKg, row.minWeightKg, row.maxWeightKg)) {
    return false;
  }
  return true;
}

function roundTo(value: number, step: number): number {
  return Math.round(Math.round(value / step) * step * 1e6) / 1e6;
}

/** Rows that agree on everything except their indication. */
function differOnlyByIndication(rows: DosingRow[]): boolean {
  const strip = (r: DosingRow) => {
    const rest: Partial<DosingRow> = { ...r };
    for (const k of ["id", "sheetRow", "indicationEn", "indicationTh", "noteEn", "noteTh", "source", "version", "approved", "hasErrors"] as const) {
      delete rest[k];
    }
    return JSON.stringify(rest);
  };
  const first = strip(rows[0]);
  return rows.every((r) => strip(r) === first);
}

export function suggestLabel(data: DrugData, patient: Patient, options: SuggestOptions = {}): LabelSuggestion {
  const allow = (row: { approved: boolean }) => row.approved || options.includeUnapproved === true;
  let usedUnapproved = false;
  const markUsed = <T extends { approved: boolean }>(row: T): T => {
    if (!row.approved) usedUnapproved = true;
    return row;
  };

  const base: LabelSuggestion = {
    product: data.product,
    gpu: null,
    doseMode: null,
    directions: null,
    reason: null,
    indicationChoices: [],
    warnings: [],
    usedUnapproved: false,
  };
  const done = (patch: Partial<LabelSuggestion>): LabelSuggestion => ({ ...base, ...patch, usedUnapproved });

  // Step 2: the GPU. Its shared columns are the same on every row; they are
  // taken from an approved, readable row.
  if (data.gpuRows.length === 0) return done({ reason: "noGpu" });
  const sorted = [...data.gpuRows].sort((a, b) => a.sheetRow - b.sheetRow);
  const shared = sorted.find((r) => !r.hasErrors && allow(r)) ?? null;
  const display = shared ?? sorted[0];
  base.gpu = display;
  if (!shared) {
    return done({ reason: sorted.some((r) => !r.hasErrors) ? "gpuNotApproved" : "rowHasErrors" });
  }
  markUsed(shared);
  const doseMode = norm(shared.doseMode) || null;
  base.doseMode = doseMode;

  // Step 4: warning labels, each from an approved Warning labels row.
  const labelsByCode = new Map(data.warningLabels.map((l) => [l.code, l]));
  base.warnings = [shared.warningLabel1, shared.warningLabel2, shared.warningLabel3]
    .map((code) => (code ? labelsByCode.get(code) : undefined))
    .filter((l): l is WarningLabelRow => l !== undefined && allow(l))
    .map(markUsed);

  if (!doseMode || doseMode === "none") return done({ reason: "noDoseMode" });
  if (patient.group === "child" && patient.ageMonths === null) return done({ reason: "needsAge" });

  // Step 3, fixed: the directions are written on the GPU row that fits.
  if (doseMode === "fixed") {
    const fitting = sorted.filter((r) => fits(r, patient));
    if (fitting.length === 0) return done({ reason: "noRowFits" });
    const preferred = fitting.some(hasWeightRange) ? fitting.filter(hasWeightRange) : fitting;
    if (preferred.length > 1) return done({ reason: "rowsTie" });
    const row = preferred[0];
    if (row.hasErrors) return done({ reason: "rowHasErrors" });
    if (!allow(row)) return done({ reason: "rowNotApproved" });
    markUsed(row);
    if (row.amountPerDose === null || !row.amountUnit) return done({ reason: "noAmount" });
    return done({
      directions: {
        source: "gpu",
        sheetRow: row.sheetRow,
        indicationEn: row.indicationEn,
        indicationTh: row.indicationTh,
        amountLow: row.amountPerDose,
        amountHigh: row.amountPerDoseMax ?? row.amountPerDose,
        amountUnit: row.amountUnit,
        timesPerDayMax: row.timesPerDayMax,
        intervalHoursMin: row.intervalHoursMin,
        asNeeded: row.asNeeded,
        timing: row.timing,
        maxPerDay: row.maxPerDay,
        maxPerDayUnit: row.maxPerDayUnit,
        maxDays: row.maxDays,
        noteEn: row.noteEn,
        noteTh: row.noteTh,
        calculation: null,
      },
    });
  }

  // Step 3, rule or lead: one ingredient drives the dose.
  const ingredients = data.ingredients.filter((i) => i.gpuId === shared.gpuId);
  let ingredient: GpuIngredientRow | undefined;
  if (doseMode === "rule") {
    if (ingredients.length !== 1) return done({ reason: "ruleNeedsOneIngredient" });
    ingredient = ingredients[0];
  } else {
    ingredient = ingredients.find((i) => norm(i.ingredient) === norm(shared.doseIngredient));
    if (!ingredient) return done({ reason: "noLeadIngredient" });
  }
  const route = norm(shared.route);
  const form = norm(shared.dosageForm);

  // Pick the Dosing row. 1: ingredient and route.
  let rows = data.dosingRows.filter(
    (r) => norm(r.ingredient) === norm(ingredient.ingredient) && norm(r.route) === route,
  );
  // 2: dosage form. Rows naming the product's form win; a release form needs one.
  const named = rows.filter((r) => norm(r.dosageForm) === form);
  rows = named.length > 0 || RELEASE_FORM.test(form) ? named : rows.filter((r) => !norm(r.dosageForm));
  // 3: the patient.
  const fitting = rows.filter((r) => fits(r, patient));
  if (fitting.length === 0) return done({ reason: "noRowFits" });
  // 4: weight range, then per kg (weight known), then fixed.
  const perKg = (r: DosingRow) => norm(r.doseBasis) === "per kg";
  const kinds = [
    fitting.filter(hasWeightRange),
    patient.weightKg !== null ? fitting.filter((r) => !hasWeightRange(r) && perKg(r)) : [],
    fitting.filter((r) => !hasWeightRange(r) && !perKg(r)),
  ];
  let candidates = kinds.find((k) => k.length > 0);
  if (!candidates) return done({ reason: "needsWeight" });
  if (candidates.length > 1) {
    if (!differOnlyByIndication(candidates)) return done({ reason: "rowsTie" });
    const choices = candidates.map((r) => ({ indicationEn: r.indicationEn, indicationTh: r.indicationTh }));
    const picked = options.indication;
    if (picked === undefined || !candidates[picked]) {
      return done({ indicationChoices: choices });
    }
    base.indicationChoices = choices;
    candidates = [candidates[picked]];
  }
  const rule = candidates[0];
  if (rule.hasErrors) return done({ reason: "rowHasErrors" });
  if (!allow(rule)) return done({ reason: "rowNotApproved" });
  markUsed(rule);

  // The dose, in dose_unit.
  if (rule.doseLow === null || !rule.doseUnit) return done({ reason: "noAmount" });
  let doseUnit = rule.doseUnit.trim();
  let low = rule.doseLow;
  let high = rule.doseHigh ?? rule.doseLow;
  if (perKg(rule)) {
    if (patient.weightKg === null) return done({ reason: "needsWeight" });
    const period = norm(rule.dosePeriod);
    if (!period) return done({ reason: "noDosePeriod" });
    doseUnit = doseUnit.replace(/\s*\/\s*kg$/i, "");
    low *= patient.weightKg;
    high *= patient.weightKg;
    if (period === "per day") {
      if (!rule.timesPerDayMax) return done({ reason: "noTimesPerDay" });
      low /= rule.timesPerDayMax;
      high /= rule.timesPerDayMax;
    }
  }
  // Cap. Caps entered before 13 November 2026 have no unit and are in mg.
  if (rule.maxSingleDose !== null) {
    const cap = convertUnit(rule.maxSingleDose, rule.maxSingleDoseUnit || "mg", doseUnit);
    if (cap === null) return done({ reason: "unitMismatch" });
    low = Math.min(low, cap);
    high = Math.min(high, cap);
  }

  // Convert to the product's units (tablets, mL, …): strength_amount
  // strength_unit per per_amount per_unit. A dose counted in drops, puffs,
  // applications or doses is used as written.
  const { strengthAmount, strengthUnit, perAmount, perUnit } = ingredient;
  const hasStrength =
    strengthAmount !== null && !!strengthUnit && perAmount !== null && perAmount > 0 && !!perUnit;
  const isCount = COUNT_UNITS.has(norm(doseUnit));
  const amountUnit = isCount || !perUnit ? doseUnit : perUnit;
  /** An amount in `unit` -> the amount unit; null when it cannot be converted. */
  const toAmount = (value: number, unit: string): number | null => {
    if (norm(unit) === norm(amountUnit)) return value;
    if (isCount || !hasStrength) return null;
    const v = convertUnit(value, unit, strengthUnit);
    return v === null ? null : v / (strengthAmount / perAmount);
  };
  if (!isCount && !hasStrength && (!perUnit || norm(doseUnit) !== norm(perUnit))) {
    return done({ reason: "noStrength" });
  }
  const exactLow = toAmount(low, doseUnit);
  const exactHigh = toAmount(high, doseUnit);
  if (exactLow === null || exactHigh === null) return done({ reason: "unitMismatch" });

  // Round to a measurable amount; no suggestion if that moves it over 15%.
  let amountLow = exactLow;
  let amountHigh = exactHigh;
  if (!isCount) {
    const step = shared.roundTo;
    if (step === null || step <= 0) {
      if (norm(amountUnit) !== norm(doseUnit)) return done({ reason: "noRoundTo" });
    } else {
      amountLow = roundTo(exactLow, step);
      amountHigh = roundTo(exactHigh, step);
      for (const [rounded, exact] of [[amountLow, exactLow], [amountHigh, exactHigh]]) {
        if (rounded <= 0 || Math.abs(rounded - exact) / exact > MAX_ROUNDING_CHANGE) {
          return done({ reason: "roundingOff" });
        }
      }
    }
  }

  // Daily maximum: the lower of max_per_day and the amount times a day.
  // `maxExact` is in the same terms as the unrounded amount, `maxPerDay` as
  // printed; they differ only for a limit counted in doses.
  let maxPerDay: number | null = null;
  let maxExact: number | null = null;
  if (rule.maxPerDay !== null) {
    let unit = rule.maxPerDayUnit || doseUnit;
    let value = rule.maxPerDay;
    if (/\/\s*kg$/i.test(unit)) {
      if (patient.weightKg === null) return done({ reason: "needsWeight" });
      value *= patient.weightKg;
      unit = unit.replace(/\s*\/\s*kg$/i, "");
    }
    if (/^doses?$/i.test(unit.trim()) && !/^doses?$/i.test(amountUnit.trim())) {
      // "8 doses" a day: eight times the amount of one dose.
      maxExact = value * exactHigh;
      maxPerDay = value * amountHigh;
    } else {
      const converted = toAmount(value, unit);
      if (converted === null) return done({ reason: "unitMismatch" });
      maxExact = converted;
      maxPerDay = converted;
    }
  }
  if (rule.timesPerDayMax !== null) {
    const byTimes = amountHigh * rule.timesPerDayMax;
    // Compared with the exact amount: 960 mg a day at 4.8 mL (rounded to 5)
    // four times is not a stricter limit, only the rounding showing.
    const stricter = maxExact !== null && maxExact < exactHigh * rule.timesPerDayMax - 1e-6;
    maxPerDay = stricter ? Math.min(maxPerDay!, byTimes) : byTimes;
  }

  return done({
    directions: {
      source: "dosing",
      sheetRow: rule.sheetRow,
      indicationEn: rule.indicationEn,
      indicationTh: rule.indicationTh,
      amountLow,
      amountHigh,
      amountUnit,
      timesPerDayMax: rule.timesPerDayMax,
      intervalHoursMin: rule.intervalHoursMin,
      asNeeded: rule.asNeeded,
      timing: rule.timing,
      maxPerDay: maxPerDay === null ? null : Math.round(maxPerDay * 100) / 100,
      maxPerDayUnit: maxPerDay === null ? null : amountUnit,
      maxDays: rule.maxDays,
      noteEn: rule.noteEn,
      noteTh: rule.noteTh,
      calculation: {
        ingredient: ingredient.ingredient,
        doseLow: low,
        doseHigh: high,
        doseUnit,
        strength: ingredient.ingredientStrength,
        exactLow,
        exactHigh,
      },
    },
  });
}
