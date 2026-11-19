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
 * (14 November 2026): product (tpu_id) -> GPU -> ingredient -> dose rule,
 * with the safety rules of her review of 17 November 2026.
 *
 * Pure: the caller loads the rows (src/lib/drug-database.ts). When anything
 * is missing, unclear, not approved or implausible, the result has no
 * directions and a reason; the label still shows the medicine and the
 * pharmacist types the directions. It never fills a gap with a guess.
 */

export type TmtProductRow = typeof drugTmtProducts.$inferSelect;
export type GpuRow = typeof drugGpus.$inferSelect;
export type GpuIngredientRow = typeof drugGpuIngredients.$inferSelect;
export type DosingRow = typeof drugDosing.$inferSelect;
export type WarningLabelRow = typeof drugWarningLabels.$inferSelect;

export type Patient = {
  /** Null until the pharmacist chooses: there is no default group. */
  group: "adult" | "child" | null;
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
  | "needsGroup"
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
  | "exceedsDailyMax"
  | "implausibleAmount"
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
  /** The dose was brought down to the daily maximum divided by the times a day. */
  cappedAtDailyMax: boolean;
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

/** One use of the medicine to choose from; `sheetRow` identifies it. */
export type IndicationChoice = { sheetRow: number; indicationEn: string | null; indicationTh: string | null };

export type LabelSuggestion = {
  product: TmtProductRow;
  /** The GPU row whose shared columns are used (strength, form, route, …). */
  gpu: GpuRow | null;
  doseMode: string | null;
  directions: Directions | null;
  reason: NoDirectionsReason | null;
  /**
   * Set when rows for different uses fit the patient: the pharmacist picks
   * one (by its sheet row, `indicationRow`) before any directions are given.
   */
  indicationChoices: IndicationChoice[];
  warnings: WarningLabelRow[];
  /** True when test mode let an unapproved row through. */
  usedUnapproved: boolean;
};

export type SuggestOptions = {
  /** Test mode: treat every row as approved. Never for a real label. */
  includeUnapproved?: boolean;
  /** Sheet row of the chosen indication. Never preselected. */
  indicationRow?: number;
};

const MAX_ROUNDING_CHANGE = 0.15;

/**
 * The most of one unit a single dose may be; above it, no suggestion. Proposed
 * in the client's review of 17 November 2026, to be confirmed by her.
 */
export const PLAUSIBLE_DOSE_LIMITS: Record<string, number> = {
  tablet: 10,
  capsule: 10,
  lozenge: 10,
  sachet: 10,
  suppository: 10,
  pessary: 10,
  ml: 60,
};

/** Doses already counted in the unit given; no strength conversion. */
const COUNT_UNITS = new Set(["drop", "puff", "application", "dose"]);

/** Forms whose dose may come only from a rule that names the form. */
const RELEASE_FORM = /prolonged-release|modified-release/;

const EPSILON = 1e-9;

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** "Tablets" -> "tablet", "pessaries" -> "pessary", "patches" -> "patch", "mL" -> "ml". */
export function singularUnit(unit: string | null | undefined): string {
  const u = norm(unit);
  if (u.endsWith("ies")) return `${u.slice(0, -3)}y`;
  if (/(ch|sh|x)es$/.test(u)) return u.slice(0, -2);
  if (u.endsWith("s") && !u.endsWith("ss") && u.length > 2) return u.slice(0, -1);
  return u;
}

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
  sheetRow: number;
  patientGroup: string | null;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  minWeightKg: number | null;
  maxWeightKg: number | null;
  indicationEn: string | null;
  indicationTh: string | null;
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

const fix = (n: number) => Math.round(n * 1e6) / 1e6;
const roundNearest = (value: number, step: number) => fix(Math.round(value / step) * step);
const roundDown = (value: number, step: number) => fix(Math.floor(value / step + EPSILON) * step);
const roundUp = (value: number, step: number) => fix(Math.ceil(value / step - EPSILON) * step);
const offBy = (rounded: number, exact: number) =>
  rounded <= 0 || exact <= 0 || Math.abs(rounded - exact) / exact > MAX_ROUNDING_CHANGE;

/**
 * `choices` lists the indications whenever there are several, also once one
 * has been chosen, so the pharmacist can see it and switch.
 */
type Picked<T> = ({ row: T } | { tie: true } | { choose: true }) & { choices: IndicationChoice[] };

/**
 * The row for the patient among those that fit. Rows are grouped by their
 * indication; inside a group, `prefer` applies the guide's order (weight
 * range, then per kg, then fixed). One group gives its row. Several groups
 * are offered as a choice when every one has its own indication (an empty
 * indication cannot be told apart, so that is a tie), and the chosen one
 * gives its row. Nothing is ever preselected.
 */
function pickRow<T extends Banded>(fitting: T[], prefer: (rows: T[]) => T[], chosenRow?: number): Picked<T> {
  const groups = new Map<string, T[]>();
  for (const row of fitting) {
    const key = `${norm(row.indicationEn)}|${norm(row.indicationTh)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const options = [...groups.entries()].map(([key, rows]) => ({ key, rows: prefer(rows) }));
  const one = (rows: T[], choices: IndicationChoice[]): Picked<T> =>
    rows.length === 1 ? { row: rows[0], choices } : { tie: true, choices };
  if (options.length === 1) return one(options[0].rows, []);
  if (options.some((o) => o.key === "|")) return { tie: true, choices: [] };
  const choices = options
    .map((o) => o.rows[0])
    .sort((a, b) => a.sheetRow - b.sheetRow)
    .map((r) => ({ sheetRow: r.sheetRow, indicationEn: r.indicationEn, indicationTh: r.indicationTh }));
  const chosen = options.find((o) => o.rows[0].sheetRow === chosenRow);
  return chosen ? one(chosen.rows, choices) : { choose: true, choices };
}

/** Solid forms taken whole: only a tablet may be halved. */
const SOLID_UNITS = new Set(["tablet", "capsule", "lozenge", "sachet", "suppository", "pessary"]);

/**
 * Whether an amount can be given as it is: a solid form is a whole number,
 * except a half tablet, allowed only where the GPU row rounds to 0.5.
 */
function measurable(amount: number, unit: string, roundTo: number | null): boolean {
  const u = singularUnit(unit);
  if (!SOLID_UNITS.has(u) || Number.isInteger(amount)) return true;
  return u === "tablet" && roundTo === 0.5 && Number.isInteger(amount * 2);
}

/** A dose above the plausible limit for its unit (10 tablets, 60 mL, …). */
function implausible(amount: number, unit: string): boolean {
  const limit = PLAUSIBLE_DOSE_LIMITS[singularUnit(unit)];
  return limit !== undefined && amount > limit + EPSILON;
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
  if (patient.group === null) return done({ reason: "needsGroup" });
  if (patient.group === "child" && patient.ageMonths === null) return done({ reason: "needsAge" });

  // Step 3, fixed: the directions are written on the GPU row that fits.
  if (doseMode === "fixed") {
    const fitting = sorted.filter((r) => fits(r, patient));
    if (fitting.length === 0) return done({ reason: "noRowFits" });
    const picked = pickRow(
      fitting,
      (rows) => (rows.some(hasWeightRange) ? rows.filter(hasWeightRange) : rows),
      options.indicationRow,
    );
    base.indicationChoices = picked.choices;
    if ("choose" in picked) return done({});
    if ("tie" in picked) return done({ reason: "rowsTie" });
    const row = picked.row;
    if (row.hasErrors) return done({ reason: "rowHasErrors" });
    if (!allow(row)) return done({ reason: "rowNotApproved" });
    markUsed(row);
    if (row.amountPerDose === null || !row.amountUnit) return done({ reason: "noAmount" });
    const high = row.amountPerDoseMax ?? row.amountPerDose;
    if (implausible(high, row.amountUnit)) return done({ reason: "implausibleAmount" });
    if (!measurable(row.amountPerDose, row.amountUnit, shared.roundTo) || !measurable(high, row.amountUnit, shared.roundTo)) {
      return done({ reason: "roundingOff" });
    }
    return done({
      directions: {
        source: "gpu",
        sheetRow: row.sheetRow,
        indicationEn: row.indicationEn,
        indicationTh: row.indicationTh,
        amountLow: row.amountPerDose,
        amountHigh: high,
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
        cappedAtDailyMax: false,
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
  // 4: by indication; for one indication, weight range, then per kg (weight
  // known), then fixed. A per kg row without the weight asks for it.
  const perKg = (r: DosingRow) => norm(r.doseBasis) === "per kg";
  const prefer = (group: DosingRow[]) =>
    [
      group.filter(hasWeightRange),
      patient.weightKg !== null ? group.filter((r) => !hasWeightRange(r) && perKg(r)) : [],
      group.filter((r) => !hasWeightRange(r) && !perKg(r)),
    ].find((k) => k.length > 0) ?? group;
  const picked = pickRow(fitting, prefer, options.indicationRow);
  base.indicationChoices = picked.choices;
  if ("choose" in picked) return done({});
  if ("tie" in picked) return done({ reason: "rowsTie" });
  const rule = picked.row;
  if (rule.hasErrors) return done({ reason: "rowHasErrors" });
  if (!allow(rule)) return done({ reason: "rowNotApproved" });
  markUsed(rule);

  // The dose, in dose_unit. dose_period says whether it is one dose or the
  // day's total, for every basis; an empty period is never assumed.
  if (rule.doseLow === null || !rule.doseUnit) return done({ reason: "noAmount" });
  let doseUnit = rule.doseUnit.trim();
  let low = rule.doseLow;
  let high = rule.doseHigh ?? rule.doseLow;
  const period = norm(rule.dosePeriod);
  if (perKg(rule)) {
    if (patient.weightKg === null) return done({ reason: "needsWeight" });
    if (!period) return done({ reason: "noDosePeriod" });
    doseUnit = doseUnit.replace(/\s*\/\s*kg$/i, "");
    low *= patient.weightKg;
    high *= patient.weightKg;
  }
  if (!period) return done({ reason: "noDosePeriod" });
  if (period === "per day") {
    if (!rule.timesPerDayMax) return done({ reason: "noTimesPerDay" });
    low /= rule.timesPerDayMax;
    high /= rule.timesPerDayMax;
  }
  // Cap one dose. Caps entered before 13 November 2026 have no unit and are in mg.
  let capDose: number | null = null;
  if (rule.maxSingleDose !== null) {
    capDose = convertUnit(rule.maxSingleDose, rule.maxSingleDoseUnit || "mg", doseUnit);
    if (capDose === null) return done({ reason: "unitMismatch" });
    low = Math.min(low, capDose);
    high = Math.min(high, capDose);
  }

  // Convert to the product's units (tablets, mL, …): strength_amount
  // strength_unit per per_amount per_unit. A dose counted in drops, puffs,
  // applications or doses is used as written.
  const { strengthAmount, strengthUnit, perAmount, perUnit } = ingredient;
  const hasStrength =
    strengthAmount !== null && !!strengthUnit && perAmount !== null && perAmount > 0 && !!perUnit;
  const isCount = COUNT_UNITS.has(singularUnit(doseUnit));
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
  let exactLow = toAmount(low, doseUnit);
  let exactHigh = toAmount(high, doseUnit);
  if (exactLow === null || exactHigh === null) return done({ reason: "unitMismatch" });
  const capAmount = capDose === null ? null : toAmount(capDose, doseUnit);

  // The daily maximum, in amount units. "8 doses" limits the number of doses,
  // not the amount of one.
  let maxDayAmount: number | null = null;
  let maxDoses: number | null = null;
  if (rule.maxPerDay !== null) {
    let unit = rule.maxPerDayUnit || doseUnit;
    let value = rule.maxPerDay;
    if (/\/\s*kg$/i.test(unit)) {
      if (patient.weightKg === null) return done({ reason: "needsWeight" });
      value *= patient.weightKg;
      unit = unit.replace(/\s*\/\s*kg$/i, "");
    }
    if (singularUnit(unit) === "dose" && singularUnit(amountUnit) !== "dose") {
      maxDoses = value;
    } else {
      maxDayAmount = toAmount(value, unit);
      if (maxDayAmount === null) return done({ reason: "unitMismatch" });
    }
  }

  // One dose must fit inside the daily maximum. A weight-based dose above it is
  // brought down to it; a fixed dose whose low end is above it is a bad row.
  const perDoseLimit = maxDayAmount === null ? null : maxDayAmount / (rule.timesPerDayMax || 1);
  let cappedAtDailyMax = false;
  if (perDoseLimit !== null) {
    if (exactHigh > perDoseLimit + EPSILON) cappedAtDailyMax = true;
    exactHigh = Math.min(exactHigh, perDoseLimit);
    if (exactLow > perDoseLimit + EPSILON) {
      if (!perKg(rule)) return done({ reason: "exceedsDailyMax" });
      exactLow = perDoseLimit;
    }
  }

  // Round to a measurable amount, never above the single-dose cap or the
  // per-dose share of the daily maximum; no suggestion if that moves it over
  // 15%. When only the low end of a range fails, it is raised to the next step.
  let amountLow = exactLow;
  let amountHigh = exactHigh;
  if (!isCount) {
    const step = shared.roundTo;
    if (step === null || step <= 0) {
      if (norm(amountUnit) !== norm(doseUnit)) return done({ reason: "noRoundTo" });
    } else {
      const ceiling = Math.min(capAmount ?? Infinity, perDoseLimit ?? Infinity);
      const round = (value: number) => {
        const nearest = roundNearest(value, step);
        return nearest > ceiling + EPSILON ? roundDown(value, step) : nearest;
      };
      amountHigh = round(exactHigh);
      if (offBy(amountHigh, exactHigh)) return done({ reason: "roundingOff" });
      amountLow = round(exactLow);
      if (offBy(amountLow, exactLow)) {
        amountLow = roundUp(exactLow, step);
        if (amountLow > amountHigh + EPSILON || amountLow <= 0) return done({ reason: "roundingOff" });
      }
    }
  }
  if (implausible(amountHigh, amountUnit)) return done({ reason: "implausibleAmount" });
  if (!measurable(amountLow, amountUnit, shared.roundTo) || !measurable(amountHigh, amountUnit, shared.roundTo)) {
    return done({ reason: "roundingOff" });
  }

  // The daily maximum printed: the lower of max_per_day and the amount times
  // a day, compared with the exact amount (960 mg a day at 4.8 mL rounded to 5
  // four times is not a stricter limit, only the rounding showing).
  const times = rule.timesPerDayMax;
  let maxPerDay: number | null = null;
  if (maxDoses !== null) {
    maxPerDay = maxDoses * amountHigh;
    if (times !== null) maxPerDay = Math.min(maxPerDay, amountHigh * times);
  } else if (times !== null) {
    const byTimes = amountHigh * times;
    const stricter = maxDayAmount !== null && maxDayAmount < exactHigh * times - 1e-6;
    maxPerDay = stricter ? Math.min(maxDayAmount!, byTimes) : byTimes;
  } else {
    maxPerDay = maxDayAmount;
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
      cappedAtDailyMax,
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
