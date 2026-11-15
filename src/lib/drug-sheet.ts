import {
  DOSE_MODES,
  PATIENT_GROUPS,
  type DrugSyncIssue,
  type DrugSyncProblem,
  drugDosing,
  drugGpuIngredients,
  drugGpus,
  drugInfo,
  drugTmtProducts,
  drugWarningLabels,
} from "@/db/schema";

/*
 * Turns the tabs of the "StockYaa drug info database" workbook into rows for
 * the drug_* tables. Every tab is read by column name, never by position. A
 * value that cannot be read is reported as an issue; the row is kept but
 * marked hasErrors, so it is never used for a dose.
 */

export const DRUG_TABS = {
  tmt: "TMT products",
  gpu: "GPU",
  ingredients: "GPU ingredients",
  dosing: "Dosing",
  info: "Drug info",
  labels: "Warning labels",
} as const;

export const TIMINGS = [
  "before food",
  "after food",
  "with food",
  "at bedtime",
  "in the morning",
  "in the evening",
  "in the morning before food",
  "with the evening meal",
  "morning and evening",
  "at the same time each day",
  "any time",
] as const;

export const DOSE_BASES = ["fixed", "per kg"] as const;
export const DOSE_PERIODS = ["per dose", "per day"] as const;

/** Drug info columns shown on the information card, in card order. */
export const DRUG_INFO_SECTIONS = [
  "indication",
  "contraindications",
  "pregnancy",
  "breastfeeding",
  "elderly",
  "kidney_liver",
  "side_effects_common",
  "side_effects_serious",
  "food_alcohol_driving",
  "counselling",
  "storage",
] as const;

const MAX_ISSUES = 300;

export type ParsedDrugDatabase = {
  tmt: (typeof drugTmtProducts.$inferInsert)[];
  gpus: (typeof drugGpus.$inferInsert)[];
  ingredients: (typeof drugGpuIngredients.$inferInsert)[];
  dosing: (typeof drugDosing.$inferInsert)[];
  info: (typeof drugInfo.$inferInsert)[];
  labels: (typeof drugWarningLabels.$inferInsert)[];
  counts: Record<string, { rows: number; approved?: number }>;
  issues: DrugSyncIssue[];
  issueCount: number;
};

/** A tab or column the sync cannot do without; nothing is loaded. */
export class DrugSheetError extends Error {
  constructor(
    readonly kind: "missingTab" | "missingColumn" | "emptyTab",
    readonly tab: string,
    readonly column = "",
  ) {
    super(`${kind}: ${tab} ${column}`);
  }
}

type Problem = DrugSyncProblem;

class Issues {
  list: DrugSyncIssue[] = [];
  count = 0;
  add(tab: string, row: number, column: string, value: string, problem: Problem) {
    this.count++;
    if (this.list.length < MAX_ISSUES) this.list.push({ tab, row, column, value, problem });
  }
}

/** Reads the cells of one data row by column name, collecting problems. */
class RowReader {
  bad = false;
  constructor(
    private readonly tab: string,
    private readonly header: Map<string, number>,
    private readonly cells: string[],
    readonly row: number,
    private readonly issues: Issues,
  ) {}

  private raw(column: string): string {
    return (this.cells[this.header.get(column)!] ?? "").trim();
  }

  private fail(column: string, value: string, problem: Problem) {
    this.bad = true;
    this.issues.add(this.tab, this.row, column, value, problem);
  }

  text(column: string): string | null {
    return this.raw(column) || null;
  }

  /** Lower-cased text, for values that are matched (route, ingredient, …). */
  key(column: string): string | null {
    const v = this.raw(column);
    return v ? v.toLowerCase().replace(/\s+/g, " ") : null;
  }

  requiredKey(column: string): string | null {
    const v = this.key(column);
    if (!v) this.fail(column, "", "required");
    return v;
  }

  number(column: string): number | null {
    const v = this.raw(column);
    if (!v) return null;
    const n = Number(v.replace(/,/g, ""));
    if (!Number.isFinite(n)) {
      this.fail(column, v, "number");
      return null;
    }
    return n;
  }

  /** A whole number such as a code or an age in months. */
  int(column: string): number | null {
    const n = this.number(column);
    if (n === null) return null;
    if (!Number.isInteger(n)) {
      this.fail(column, this.raw(column), "wholeNumber");
      return null;
    }
    return n;
  }

  requiredInt(column: string): number | null {
    const n = this.int(column);
    if (n === null && !this.raw(column)) this.fail(column, "", "required");
    return n;
  }

  /** yes / no; an empty cell is no. */
  yesNo(column: string): boolean {
    const v = this.raw(column).toLowerCase();
    if (v === "yes" || v === "true") return true;
    if (v === "" || v === "no" || v === "false") return false;
    this.fail(column, this.raw(column), "yesNo");
    return false;
  }

  /** One of a fixed list of values, or empty. */
  oneOf(column: string, values: readonly string[]): string | null {
    const v = this.key(column);
    if (v === null || values.includes(v)) return v;
    this.fail(column, this.raw(column), "value");
    return null;
  }
}

type Tab = { name: string; header: Map<string, number>; rows: { cells: string[]; row: number }[] };

function openTab(sheets: Map<string, string[][]>, name: string, columns: string[]): Tab {
  const grid = sheets.get(name);
  if (!grid) throw new DrugSheetError("missingTab", name);
  const headerIndex = grid.findIndex((r) => r.some((c) => c.trim()));
  if (headerIndex < 0) throw new DrugSheetError("emptyTab", name);
  const header = new Map<string, number>();
  grid[headerIndex].forEach((c, i) => {
    const key = c.trim().toLowerCase();
    if (key && !header.has(key)) header.set(key, i);
  });
  for (const column of columns) {
    if (!header.has(column)) throw new DrugSheetError("missingColumn", name, column);
  }
  const rows: Tab["rows"] = [];
  for (let i = headerIndex + 1; i < grid.length; i++) {
    const cells = grid[i];
    if (cells.some((c) => c.trim())) rows.push({ cells, row: i + 1 });
  }
  return { name, header, rows };
}

const GPU_COLUMNS = [
  "gpu_id", "gpu_name", "active_ingredient", "strength", "dosage_form", "route", "disp_unit",
  "combination", "dose_mode", "dose_ingredient", "round_to", "patient_group", "indication_en",
  "indication_th", "amount_per_dose", "amount_per_dose_max", "amount_unit", "times_per_day_max",
  "interval_hours_min", "as_needed", "max_per_day", "max_per_day_unit", "max_days",
  "min_age_months", "max_age_months", "min_weight_kg", "max_weight_kg", "timing",
  "warning_label_1", "warning_label_2", "warning_label_3", "note_en", "note_th", "version",
  "approved",
];

const DOSING_COLUMNS = [
  "ingredient", "route", "dosage_form", "patient_group", "indication_en", "indication_th",
  "dose_basis", "dose_low", "dose_high", "dose_unit", "dose_period", "times_per_day_max",
  "interval_hours_min", "as_needed", "max_single_dose", "max_single_dose_unit", "max_per_day",
  "max_per_day_unit", "max_days", "min_age_months", "max_age_months", "min_weight_kg",
  "max_weight_kg", "timing", "note_en", "note_th", "source", "version", "approved",
];

const INFO_COLUMNS = [
  "ingredient", "route", "name_th", "drug_class", "source", "version", "approved",
  ...DRUG_INFO_SECTIONS.flatMap((s) => [`${s}_en`, `${s}_th`]),
];

/** Parses the six tabs the app reads. Throws DrugSheetError when one is unusable. */
export function parseDrugWorkbook(sheets: Map<string, string[][]>): ParsedDrugDatabase {
  const issues = new Issues();
  const tabs = {
    tmt: openTab(sheets, DRUG_TABS.tmt, ["tpu_id", "gpu_id", "trade_name", "manufacturer"]),
    gpu: openTab(sheets, DRUG_TABS.gpu, GPU_COLUMNS),
    ingredients: openTab(sheets, DRUG_TABS.ingredients, [
      "gpu_id", "position", "ingredient", "ingredient_strength", "route", "strength_amount",
      "strength_unit", "per_amount", "per_unit",
    ]),
    dosing: openTab(sheets, DRUG_TABS.dosing, DOSING_COLUMNS),
    info: openTab(sheets, DRUG_TABS.info, INFO_COLUMNS),
    labels: openTab(sheets, DRUG_TABS.labels, ["label_code", "text_en", "text_th", "version", "approved"]),
  };
  const reader = (tab: Tab, r: Tab["rows"][number]) =>
    new RowReader(tab.name, tab.header, r.cells, r.row, issues);

  // Rows whose key is missing or repeated cannot be stored; they are reported.
  function unique<T>(tab: Tab, key: (r: RowReader) => string | null, build: (r: RowReader) => T) {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const row of tab.rows) {
      const r = reader(tab, row);
      const k = key(r);
      if (k === null) continue;
      if (seen.has(k)) {
        issues.add(tab.name, row.row, "", k, "duplicate");
        continue;
      }
      seen.add(k);
      out.push(build(r));
    }
    return out;
  }

  const tmt = unique(
    tabs.tmt,
    (r) => {
      const tpu = r.requiredInt("tpu_id");
      const gpu = r.requiredInt("gpu_id");
      return tpu === null || gpu === null || !r.text("trade_name") ? null : String(tpu);
    },
    (r) => ({
      tpuId: r.int("tpu_id")!,
      gpuId: r.int("gpu_id")!,
      tradeName: r.text("trade_name")!,
      manufacturer: r.text("manufacturer"),
    }),
  );

  const gpus: ParsedDrugDatabase["gpus"] = [];
  for (const row of tabs.gpu.rows) {
    const r = reader(tabs.gpu, row);
    const gpuId = r.requiredInt("gpu_id");
    const gpuName = r.text("gpu_name");
    if (gpuId === null || !gpuName) continue;
    const values = {
      gpuId,
      sheetRow: r.row,
      gpuName,
      activeIngredient: r.key("active_ingredient"),
      strength: r.text("strength"),
      dosageForm: r.key("dosage_form"),
      route: r.key("route"),
      dispUnit: r.text("disp_unit"),
      combination: r.yesNo("combination"),
      doseMode: r.oneOf("dose_mode", DOSE_MODES),
      doseIngredient: r.key("dose_ingredient"),
      roundTo: r.number("round_to"),
      patientGroup: r.oneOf("patient_group", PATIENT_GROUPS),
      indicationEn: r.text("indication_en"),
      indicationTh: r.text("indication_th"),
      amountPerDose: r.number("amount_per_dose"),
      amountPerDoseMax: r.number("amount_per_dose_max"),
      amountUnit: r.text("amount_unit"),
      timesPerDayMax: r.number("times_per_day_max"),
      intervalHoursMin: r.number("interval_hours_min"),
      asNeeded: r.yesNo("as_needed"),
      maxPerDay: r.number("max_per_day"),
      maxPerDayUnit: r.text("max_per_day_unit"),
      maxDays: r.number("max_days"),
      minAgeMonths: r.int("min_age_months"),
      maxAgeMonths: r.int("max_age_months"),
      minWeightKg: r.number("min_weight_kg"),
      maxWeightKg: r.number("max_weight_kg"),
      timing: r.oneOf("timing", TIMINGS),
      warningLabel1: r.text("warning_label_1")?.toUpperCase() ?? null,
      warningLabel2: r.text("warning_label_2")?.toUpperCase() ?? null,
      warningLabel3: r.text("warning_label_3")?.toUpperCase() ?? null,
      noteEn: r.text("note_en"),
      noteTh: r.text("note_th"),
      version: r.int("version"),
      approved: r.yesNo("approved"),
    };
    gpus.push({ ...values, hasErrors: r.bad });
  }

  const ingredients = unique(
    tabs.ingredients,
    (r) => {
      const gpu = r.requiredInt("gpu_id");
      const position = r.requiredInt("position");
      const ingredient = r.requiredKey("ingredient");
      return gpu === null || position === null || !ingredient ? null : `${gpu}/${position}`;
    },
    (r) => ({
      gpuId: r.int("gpu_id")!,
      position: r.int("position")!,
      ingredient: r.key("ingredient")!,
      ingredientStrength: r.text("ingredient_strength"),
      route: r.key("route"),
      strengthAmount: r.number("strength_amount"),
      strengthUnit: r.text("strength_unit"),
      perAmount: r.number("per_amount"),
      perUnit: r.text("per_unit"),
    }),
  );

  const dosing: ParsedDrugDatabase["dosing"] = [];
  for (const row of tabs.dosing.rows) {
    const r = reader(tabs.dosing, row);
    const ingredient = r.requiredKey("ingredient");
    const route = r.requiredKey("route");
    if (!ingredient || !route) continue;
    const values = {
      sheetRow: r.row,
      ingredient,
      route,
      dosageForm: r.key("dosage_form"),
      patientGroup: r.oneOf("patient_group", PATIENT_GROUPS),
      indicationEn: r.text("indication_en"),
      indicationTh: r.text("indication_th"),
      doseBasis: r.oneOf("dose_basis", DOSE_BASES),
      doseLow: r.number("dose_low"),
      doseHigh: r.number("dose_high"),
      doseUnit: r.text("dose_unit"),
      dosePeriod: r.oneOf("dose_period", DOSE_PERIODS),
      timesPerDayMax: r.number("times_per_day_max"),
      intervalHoursMin: r.number("interval_hours_min"),
      asNeeded: r.yesNo("as_needed"),
      maxSingleDose: r.number("max_single_dose"),
      maxSingleDoseUnit: r.text("max_single_dose_unit"),
      maxPerDay: r.number("max_per_day"),
      maxPerDayUnit: r.text("max_per_day_unit"),
      maxDays: r.number("max_days"),
      minAgeMonths: r.int("min_age_months"),
      maxAgeMonths: r.int("max_age_months"),
      minWeightKg: r.number("min_weight_kg"),
      maxWeightKg: r.number("max_weight_kg"),
      timing: r.oneOf("timing", TIMINGS),
      noteEn: r.text("note_en"),
      noteTh: r.text("note_th"),
      source: r.text("source"),
      version: r.int("version"),
      approved: r.yesNo("approved"),
    };
    dosing.push({ ...values, hasErrors: r.bad });
  }

  const info = unique(
    tabs.info,
    (r) => {
      const ingredient = r.requiredKey("ingredient");
      const route = r.requiredKey("route");
      return ingredient && route ? `${ingredient}/${route}` : null;
    },
    (r) => {
      const sections: Record<string, string> = {};
      for (const s of DRUG_INFO_SECTIONS) {
        for (const lang of ["en", "th"]) {
          const v = r.text(`${s}_${lang}`);
          if (v) sections[`${s}_${lang}`] = v;
        }
      }
      return {
        ingredient: r.key("ingredient")!,
        route: r.key("route")!,
        nameTh: r.text("name_th"),
        drugClass: r.text("drug_class"),
        sections,
        source: r.text("source"),
        version: r.int("version"),
        approved: r.yesNo("approved"),
      };
    },
  );

  const labels = unique(
    tabs.labels,
    (r) => r.text("label_code")?.toUpperCase() ?? null,
    (r) => ({
      code: r.text("label_code")!.toUpperCase(),
      textEn: r.text("text_en"),
      textTh: r.text("text_th"),
      version: r.int("version"),
      approved: r.yesNo("approved"),
    }),
  );

  const approved = (rows: { approved?: boolean }[]) => rows.filter((r) => r.approved).length;
  return {
    tmt,
    gpus,
    ingredients,
    dosing,
    info,
    labels,
    counts: {
      [DRUG_TABS.tmt]: { rows: tmt.length },
      [DRUG_TABS.gpu]: { rows: gpus.length, approved: approved(gpus) },
      [DRUG_TABS.ingredients]: { rows: ingredients.length },
      [DRUG_TABS.dosing]: { rows: dosing.length, approved: approved(dosing) },
      [DRUG_TABS.info]: { rows: info.length, approved: approved(info) },
      [DRUG_TABS.labels]: { rows: labels.length, approved: approved(labels) },
    },
    issues: issues.list,
    issueCount: issues.count,
  };
}
