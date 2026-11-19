// Tests for the dose engine and label text: npm test.
// Cases from the client's review of 17 November 2026 (stockyaa-dose-label-fixes.md).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTranslator, getMessages } from "@/i18n/messages";
import {
  singularUnit,
  suggestLabel,
  type DosingRow,
  type DrugData,
  type GpuIngredientRow,
  type GpuRow,
  type Patient,
  type WarningLabelRow,
} from "./dosing";
import { buildLabelText } from "./drug-label";
import { dosingContradiction } from "./drug-sheet";

const ADULT: Patient = { group: "adult", ageMonths: null, weightKg: null };

function gpu(patch: Partial<GpuRow> = {}): GpuRow {
  return {
    id: "gpu",
    gpuId: 10,
    sheetRow: 2,
    gpuName: "test",
    activeIngredient: "x",
    strength: "500 mg",
    dosageForm: "tablet",
    route: "oral",
    dispUnit: "tablet",
    combination: false,
    doseMode: "rule",
    doseIngredient: null,
    roundTo: 1,
    patientGroup: "adult",
    indicationEn: null,
    indicationTh: null,
    amountPerDose: null,
    amountPerDoseMax: null,
    amountUnit: null,
    timesPerDayMax: null,
    intervalHoursMin: null,
    asNeeded: false,
    maxPerDay: null,
    maxPerDayUnit: null,
    maxDays: null,
    minAgeMonths: null,
    maxAgeMonths: null,
    minWeightKg: null,
    maxWeightKg: null,
    timing: null,
    warningLabel1: null,
    warningLabel2: null,
    warningLabel3: null,
    noteEn: null,
    noteTh: null,
    version: 1,
    approved: true,
    hasErrors: false,
    ...patch,
  };
}

function strength(amount: number, unit: string, per: number, perUnit: string): GpuIngredientRow {
  return {
    gpuId: 10,
    position: 1,
    ingredient: "x",
    ingredientStrength: `${amount} ${unit}/${per} ${perUnit}`,
    route: "oral",
    strengthAmount: amount,
    strengthUnit: unit,
    perAmount: per,
    perUnit,
  };
}

let nextRow = 100;
function dosing(patch: Partial<DosingRow> = {}): DosingRow {
  return {
    id: `d${nextRow}`,
    sheetRow: nextRow++,
    ingredient: "x",
    route: "oral",
    dosageForm: null,
    patientGroup: "adult",
    indicationEn: null,
    indicationTh: null,
    doseBasis: "fixed",
    doseLow: 500,
    doseHigh: 500,
    doseUnit: "mg",
    dosePeriod: "per dose",
    timesPerDayMax: null,
    intervalHoursMin: null,
    asNeeded: false,
    maxSingleDose: null,
    maxSingleDoseUnit: null,
    maxPerDay: null,
    maxPerDayUnit: null,
    maxDays: null,
    minAgeMonths: null,
    maxAgeMonths: null,
    minWeightKg: null,
    maxWeightKg: null,
    timing: null,
    noteEn: null,
    noteTh: null,
    source: null,
    version: 1,
    approved: true,
    hasErrors: false,
    ...patch,
  };
}

function data(opts: {
  gpu?: Partial<GpuRow>;
  gpuRows?: GpuRow[];
  ingredient: GpuIngredientRow;
  rows: DosingRow[];
  labels?: WarningLabelRow[];
}): DrugData {
  return {
    product: { tpuId: 1, gpuId: 10, tradeName: "TEST", manufacturer: null },
    gpuRows: opts.gpuRows ?? [gpu(opts.gpu)],
    ingredients: [opts.ingredient],
    dosingRows: opts.rows,
    warningLabels: opts.labels ?? [],
  };
}

const amounts = (s: ReturnType<typeof suggestLabel>) =>
  s.directions ? [s.directions.amountLow, s.directions.amountHigh, s.directions.amountUnit] : s.reason;

describe("suggestLabel: cases from the review", () => {
  it("paracetamol 500 mg tablet, adult, 500–1,000 mg per dose: 1–2 tablets", () => {
    const s = suggestLabel(
      data({
        gpu: { roundTo: 0.5 },
        ingredient: strength(500, "mg", 1, "tablet"),
        rows: [dosing({ doseLow: 500, doseHigh: 1000, timesPerDayMax: 4, maxSingleDose: 1000, maxSingleDoseUnit: "mg" })],
      }),
      ADULT,
    );
    assert.deepEqual(amounts(s), [1, 2, "tablet"]);
  });

  it("paracetamol 120 mg/5 mL, child 3 years, 180 mg per dose: 7.5 mL", () => {
    const s = suggestLabel(
      data({
        gpu: { roundTo: 2.5, dosageForm: "syrup" },
        ingredient: strength(120, "mg", 5, "mL"),
        rows: [dosing({ patientGroup: "child", doseLow: 180, doseHigh: 180, minAgeMonths: 24, maxAgeMonths: 47, timesPerDayMax: 4 })],
      }),
      { group: "child", ageMonths: 36, weightKg: null },
    );
    assert.deepEqual(amounts(s), [7.5, 7.5, "mL"]);
  });

  it("thiamazole 5 mg, 15–60 mg per day in 3 doses: 1–4 tablets, 3 times a day", () => {
    const s = suggestLabel(
      data({
        ingredient: strength(5, "mg", 1, "tablet"),
        rows: [dosing({ doseLow: 15, doseHigh: 60, dosePeriod: "per day", timesPerDayMax: 3 })],
      }),
      ADULT,
    );
    assert.deepEqual(amounts(s), [1, 4, "tablet"]);
    assert.equal(s.directions?.timesPerDayMax, 3);
  });

  it("a fixed row with dose_period empty: no suggestion", () => {
    const s = suggestLabel(
      data({ ingredient: strength(500, "mg", 1, "tablet"), rows: [dosing({ dosePeriod: null })] }),
      ADULT,
    );
    assert.equal(s.reason, "noDosePeriod");
  });

  it("a per day row without times a day: no suggestion", () => {
    const s = suggestLabel(
      data({ ingredient: strength(500, "mg", 1, "tablet"), rows: [dosing({ dosePeriod: "per day" })] }),
      ADULT,
    );
    assert.equal(s.reason, "noTimesPerDay");
  });

  it("prochlorperazine 15–40 mg per dose, 4 times, max 40 mg a day: rejected at sync", () => {
    const problem = dosingContradiction({
      doseLow: 15,
      doseHigh: 40,
      doseUnit: "mg",
      dosePeriod: "per dose",
      timesPerDayMax: 4,
      maxSingleDose: null,
      maxSingleDoseUnit: null,
      maxPerDay: 40,
      maxPerDayUnit: "mg",
    });
    assert.equal(problem?.column, "max_per_day");
  });

  it("sync also rejects a dose above its own cap, and a range upside down", () => {
    const row = { doseUnit: "mg", dosePeriod: "per dose", timesPerDayMax: null, maxPerDay: null, maxPerDayUnit: null };
    assert.equal(
      dosingContradiction({ ...row, doseLow: 500, doseHigh: 500, maxSingleDose: 250, maxSingleDoseUnit: "mg" })?.column,
      "max_single_dose",
    );
    assert.equal(
      dosingContradiction({ ...row, doseLow: 500, doseHigh: 250, maxSingleDose: null, maxSingleDoseUnit: null })?.column,
      "dose_high",
    );
    assert.equal(
      dosingContradiction({ ...row, doseLow: 500, doseHigh: 1000, maxSingleDose: 1000, maxSingleDoseUnit: "mg" }),
      null,
    );
  });

  it("50 mg/kg/day in 3 doses, 80 kg, max 3,000 mg a day, 500 mg capsule: 2 capsules, 3 times a day", () => {
    const s = suggestLabel(
      data({
        gpu: { dosageForm: "capsule" },
        ingredient: strength(500, "mg", 1, "capsule"),
        rows: [
          dosing({
            doseBasis: "per kg",
            doseLow: 50,
            doseHigh: 50,
            doseUnit: "mg/kg",
            dosePeriod: "per day",
            timesPerDayMax: 3,
            maxPerDay: 3000,
            maxPerDayUnit: "mg",
          }),
        ],
      }),
      { group: "adult", ageMonths: null, weightKg: 80 },
    );
    assert.deepEqual(amounts(s), [2, 2, "capsule"]);
    assert.equal(s.directions?.timesPerDayMax, 3);
  });

  it("a fixed dose whose smallest amount is above the daily maximum: no suggestion", () => {
    const s = suggestLabel(
      data({
        ingredient: strength(500, "mg", 1, "capsule"),
        rows: [dosing({ doseLow: 1500, doseHigh: 1500, timesPerDayMax: 3, maxPerDay: 3000, maxPerDayUnit: "mg" })],
      }),
      ADULT,
    );
    assert.equal(s.reason, "exceedsDailyMax");
  });

  it("the daily maximum brings down the top of a range", () => {
    const s = suggestLabel(
      data({
        ingredient: strength(500, "mg", 1, "tablet"),
        rows: [dosing({ doseLow: 500, doseHigh: 1500, timesPerDayMax: 3, maxPerDay: 3000, maxPerDayUnit: "mg" })],
      }),
      ADULT,
    );
    assert.deepEqual(amounts(s), [1, 2, "tablet"]);
  });

  it("cap 1,000 mg with a 350 mg tablet, step 1: never 3 tablets; no suggestion", () => {
    const s = suggestLabel(
      data({
        gpu: { strength: "350 mg" },
        ingredient: strength(350, "mg", 1, "tablet"),
        rows: [dosing({ doseLow: 1000, doseHigh: 1000, maxSingleDose: 1000, maxSingleDoseUnit: "mg" })],
      }),
      ADULT,
    );
    assert.equal(s.reason, "roundingOff");
  });

  it("250–500 mg per dose with a 500 mg capsule, step 1: 1 capsule", () => {
    const s = suggestLabel(
      data({ ingredient: strength(500, "mg", 1, "capsule"), rows: [dosing({ doseLow: 250, doseHigh: 500 })] }),
      ADULT,
    );
    assert.deepEqual(amounts(s), [1, 1, "capsule"]);
  });

  it("activated charcoal 250 mg tablet, 20–30 g: implausible, no suggestion", () => {
    const s = suggestLabel(
      data({
        ingredient: strength(250, "mg", 1, "tablet"),
        rows: [dosing({ doseLow: 20, doseHigh: 30, doseUnit: "g" })],
      }),
      ADULT,
    );
    assert.equal(s.reason, "implausibleAmount");
  });

  it("more than 60 mL per dose: implausible", () => {
    const s = suggestLabel(
      data({
        gpu: { roundTo: 5 },
        ingredient: strength(120, "mg", 5, "mL"),
        rows: [dosing({ doseLow: 2000, doseHigh: 2000 })],
      }),
      ADULT,
    );
    assert.equal(s.reason, "implausibleAmount");
  });

  it("patient group not chosen: no suggestion", () => {
    const s = suggestLabel(
      data({ ingredient: strength(500, "mg", 1, "tablet"), rows: [dosing()] }),
      { group: null, ageMonths: null, weightKg: null },
    );
    assert.equal(s.reason, "needsGroup");
    assert.equal(s.directions, null);
  });

  it("amoxicillin, five rows with different doses and uses: choose first, then that row's dose", () => {
    const uses = ["Otitis", "Sinusitis", "Pneumonia", "Dental abscess", "UTI"];
    const rows = uses.map((use, i) =>
      dosing({ indicationEn: use, indicationTh: `ใช้ ${i}`, doseLow: 500 * (1 + (i % 2)), doseHigh: 500 * (1 + (i % 2)), timesPerDayMax: 3 }),
    );
    const d = data({ ingredient: strength(500, "mg", 1, "capsule"), rows });
    const first = suggestLabel(d, ADULT);
    assert.equal(first.directions, null);
    assert.equal(first.reason, null);
    assert.equal(first.indicationChoices.length, 5);

    const chosen = rows[1];
    const second = suggestLabel(d, ADULT, { indicationRow: chosen.sheetRow });
    assert.equal(second.directions?.sheetRow, chosen.sheetRow);
    assert.deepEqual(amounts(second), [2, 2, "capsule"]);
    assert.equal(second.indicationChoices.length, 5, "the choices stay visible after picking");
  });

  it("a choice id that no longer fits is not used: the pharmacist chooses again", () => {
    const rows = ["A", "B"].map((use) => dosing({ indicationEn: use, timesPerDayMax: 3 }));
    const s = suggestLabel(data({ ingredient: strength(500, "mg", 1, "tablet"), rows }), ADULT, {
      indicationRow: 999_999,
    });
    assert.equal(s.directions, null);
    assert.equal(s.indicationChoices.length, 2);
  });

  it("several rows when one has no indication: a tie, no suggestion", () => {
    const rows = [dosing({ indicationEn: "A" }), dosing({ indicationEn: null })];
    const s = suggestLabel(data({ ingredient: strength(500, "mg", 1, "tablet"), rows }), ADULT);
    assert.equal(s.reason, "rowsTie");
  });

  it("same use, a weight band and an age band: the weight band wins (the guide's order)", () => {
    const rows = [
      dosing({ patientGroup: "child", minAgeMonths: 24, maxAgeMonths: 71, doseLow: 120, doseHigh: 120 }),
      dosing({ patientGroup: "child", minWeightKg: 15, maxWeightKg: 20, doseLow: 240, doseHigh: 240 }),
    ];
    const s = suggestLabel(
      data({ gpu: { roundTo: 2.5 }, ingredient: strength(120, "mg", 5, "mL"), rows }),
      { group: "child", ageMonths: 48, weightKg: 17 },
    );
    assert.deepEqual(amounts(s), [10, 10, "mL"]);
  });

  it("a per kg row offered alongside a fixed row of another use, once the weight is known", () => {
    const rows = [
      dosing({ indicationEn: "Fever", doseBasis: "per kg", doseLow: 15, doseHigh: 15, doseUnit: "mg/kg" }),
      dosing({ indicationEn: "Pain", doseLow: 500, doseHigh: 500 }),
    ];
    const s = suggestLabel(data({ ingredient: strength(500, "mg", 1, "tablet"), rows }), {
      group: "adult",
      ageMonths: null,
      weightKg: 70,
    });
    assert.equal(s.indicationChoices.length, 2);
  });
});

describe("label text", () => {
  it("cetirizine 1 mg/mL syrup, 10 mg once a day: oral wording, no 24-hour line, warnings, no note", () => {
    const labels: WarningLabelRow[] = [
      { code: "W002", textEn: "May cause drowsiness.", textTh: "อาจทำให้ง่วงนอน", version: 1, approved: true, mustPrint: false },
      { code: "W005", textEn: "Avoid alcohol.", textTh: "หลีกเลี่ยงแอลกอฮอล์", version: 1, approved: true, mustPrint: false },
    ];
    const s = suggestLabel(
      data({
        gpu: { roundTo: 2.5, dosageForm: "oral solution", warningLabel1: "W002", warningLabel2: "W005" },
        ingredient: strength(1, "mg", 1, "mL"),
        rows: [dosing({ doseLow: 10, doseHigh: 10, timesPerDayMax: 1, intervalHoursMin: 24, noteTh: "หมายเหตุสำหรับเภสัชกร" })],
        labels,
      }),
      ADULT,
    );
    const text = buildLabelText(s, createTranslator(getMessages("th")), "th");
    assert.deepEqual(text.directions, ["รับประทานครั้งละ 10 มล.", "วันละ 1 ครั้ง"]);
    assert.deepEqual(text.warnings, ["อาจทำให้ง่วงนอน", "หลีกเลี่ยงแอลกอฮอล์"]);
    assert.ok(!text.directions.join(" ").includes("หมายเหตุ"), "the note is not in the printed directions");
  });

  it("plural units are recognised", () => {
    assert.equal(singularUnit("Pessaries"), "pessary");
    assert.equal(singularUnit("suppositories"), "suppository");
    assert.equal(singularUnit("patches"), "patch");
    assert.equal(singularUnit("tablets"), "tablet");
    assert.equal(singularUnit("mL"), "ml");
    assert.equal(singularUnit("g"), "g");
  });
});

describe("client answers of 19 November 2026", () => {
  const th = createTranslator(getMessages("th"));
  const en = createTranslator(getMessages("en"));
  const tablet = (dose: number, roundTo: number) =>
    suggestLabel(
      data({ gpu: { roundTo }, ingredient: strength(500, "mg", 1, "tablet"), rows: [dosing({ doseLow: dose, doseHigh: dose, timesPerDayMax: 2 })] }),
      ADULT,
    );

  it("half a tablet where round_to is 0.5: ครึ่งเม็ด / half a tablet", () => {
    const s = tablet(250, 0.5);
    assert.deepEqual(amounts(s), [0.5, 0.5, "tablet"]);
    assert.equal(buildLabelText(s, th, "th").directions[0], "รับประทานครั้งละ ครึ่งเม็ด");
    assert.equal(buildLabelText(s, en, "en").directions[0], "Take half a tablet");
  });

  it("one and a half tablets: 1 เม็ดครึ่ง / one and a half tablets", () => {
    const s = tablet(750, 0.5);
    assert.equal(buildLabelText(s, th, "th").directions[0], "รับประทานครั้งละ 1 เม็ดครึ่ง");
    assert.equal(buildLabelText(s, en, "en").directions[0], "Take one and a half tablets");
  });

  it("no half tablet where round_to is not 0.5", () => {
    assert.equal(tablet(250, 1).reason, "roundingOff");
    assert.equal(tablet(250, 0.1).reason, "roundingOff");
  });

  it("a capsule is never halved", () => {
    const s = suggestLabel(
      data({ gpu: { roundTo: 0.5 }, ingredient: strength(500, "mg", 1, "capsule"), rows: [dosing({ doseLow: 250, doseHigh: 250 })] }),
      ADULT,
    );
    assert.equal(s.reason, "roundingOff");
  });

  it("a weight-based dose brought down to the daily maximum is flagged for the pharmacist", () => {
    const s = suggestLabel(
      data({
        ingredient: strength(500, "mg", 1, "capsule"),
        rows: [dosing({ doseBasis: "per kg", doseLow: 50, doseHigh: 50, doseUnit: "mg/kg", dosePeriod: "per day", timesPerDayMax: 3, maxPerDay: 3000, maxPerDayUnit: "mg" })],
      }),
      { group: "adult", ageMonths: null, weightKg: 80 },
    );
    assert.equal(s.directions?.cappedAtDailyMax, true);
    const plain = suggestLabel(
      data({ ingredient: strength(500, "mg", 1, "tablet"), rows: [dosing({ timesPerDayMax: 3, maxPerDay: 3000, maxPerDayUnit: "mg" })] }),
      ADULT,
    );
    assert.equal(plain.directions?.cappedAtDailyMax, false);
  });

  it("English verbs that fit the route; Thai keeps ครั้งละ", () => {
    const drops = suggestLabel(
      data({
        gpu: { route: "eye", dosageForm: "eye drops, solution" },
        ingredient: { ...strength(5, "mg", 1, "mL"), route: "eye" },
        rows: [dosing({ route: "eye", doseLow: 2, doseHigh: 2, doseUnit: "drop", timesPerDayMax: 4 })],
      }),
      ADULT,
    );
    assert.equal(buildLabelText(drops, en, "en").directions[0], "Use 2 drops");
    assert.equal(buildLabelText(drops, th, "th").directions[0], "ครั้งละ 2 หยด");
    const cream = suggestLabel(
      data({
        gpu: { route: "skin", dosageForm: "cream" },
        ingredient: { ...strength(1, "g", 100, "g"), route: "skin" },
        rows: [dosing({ route: "skin", doseLow: 1, doseHigh: 1, doseUnit: "application", timesPerDayMax: 2 })],
      }),
      ADULT,
    );
    assert.equal(buildLabelText(cream, en, "en").directions[0], "Apply 1 application");
  });
});
