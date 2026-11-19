// Tests for the label design rules: npm test.
// Cases from the client's stockyaa-label-design-spec.md (17 November 2026).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Directions } from "./dosing";
import {
  defaultSlots,
  labelDate,
  labelSize,
  missingItems,
  placeWarnings,
  titleCaseIngredients,
  type LabelContent,
} from "./label-layout";

function directions(patch: Partial<Directions>): Directions {
  return {
    source: "dosing",
    sheetRow: 2,
    indicationEn: null,
    indicationTh: null,
    amountLow: 1,
    amountHigh: 1,
    amountUnit: "capsule",
    timesPerDayMax: 3,
    intervalHoursMin: null,
    asNeeded: false,
    timing: "after food",
    maxPerDay: null,
    maxPerDayUnit: null,
    maxDays: null,
    noteEn: null,
    noteTh: null,
    cappedAtDailyMax: false,
    calculation: null,
    ...patch,
  };
}

const content: LabelContent = {
  language: "th",
  pharmacyName: "ร้านยา ฟาร์มา-ซี",
  pharmacyAddress: "ภูเก็ต",
  pharmacyPhone: "076-000-000",
  logo: null,
  patientName: "คุณสมชาย",
  date: "17 พ.ย. 2569",
  drugName: "Amoxicillin",
  strength: "500 mg",
  noStrength: false,
  thaiName: "อะม็อกซีซิลลิน",
  quantity: "20 แคปซูล",
  indication: "ฆ่าเชื้อแบคทีเรีย",
  directions: "รับประทานครั้งละ 1 แคปซูล\nวันละ 3 ครั้ง หลังอาหาร",
  slots: null,
  warnings: [],
  pharmacistName: "ภญ. ตัวอย่าง",
  pharmacistLicense: "12345",
};

describe("time-of-day boxes", () => {
  it("amoxicillin 3 times a day: morning, noon, evening; bedtime empty", () => {
    assert.deepEqual(defaultSlots(directions({})), { morning: "1", noon: "1", evening: "1", bedtime: null });
  });
  it("once a day at bedtime: only the bedtime box", () => {
    assert.deepEqual(defaultSlots(directions({ timesPerDayMax: 1, timing: "at bedtime" })), {
      morning: null,
      noon: null,
      evening: null,
      bedtime: "1",
    });
  });
  it("twice a day, a range: morning and evening, 1–2 each", () => {
    assert.deepEqual(defaultSlots(directions({ timesPerDayMax: 2, amountLow: 1, amountHigh: 2 })), {
      morning: "1–2",
      noon: null,
      evening: "1–2",
      bedtime: null,
    });
  });
  it("every 6 hours (no times a day): no boxes", () => {
    assert.equal(defaultSlots(directions({ timesPerDayMax: null, intervalHoursMin: 6 })), null);
  });
  it("when needed, at most 4 times a day: no boxes", () => {
    assert.equal(defaultSlots(directions({ asNeeded: true, timesPerDayMax: 4 })), null);
  });
  it("more than 4 times a day: no boxes", () => {
    assert.equal(defaultSlots(directions({ timesPerDayMax: 6 })), null);
  });
  it("nothing suggested: no boxes", () => {
    assert.equal(defaultSlots(null), null);
  });
});

describe("required items (Thai GPP)", () => {
  it("a complete label has nothing missing", () => {
    assert.deepEqual(missingItems(content), []);
  });
  it("pharmacy address empty: blocked, naming the field", () => {
    assert.deepEqual(missingItems({ ...content, pharmacyAddress: " " }), ["pharmacyAddress"]);
  });
  it("patient name empty: blocked", () => {
    assert.deepEqual(missingItems({ ...content, patientName: "" }), ["patientName"]);
  });
  it("indication not chosen: blocked", () => {
    assert.deepEqual(missingItems({ ...content, indication: "" }), ["indication"]);
  });
  it("no licence number: blocked", () => {
    assert.deepEqual(missingItems({ ...content, pharmacistLicense: "" }), ["pharmacistLicense"]);
  });
  it("strength empty is fine only for a product with no strength", () => {
    assert.deepEqual(missingItems({ ...content, strength: "" }), ["strength"]);
    assert.deepEqual(missingItems({ ...content, strength: "", noStrength: true }), []);
  });
});

describe("warnings", () => {
  const a = { text: "A", mustPrint: false };
  const b = { text: "B", mustPrint: false };
  const must = { text: "MUST", mustPrint: true };
  it("two warnings on a compact sticker: one printed, the other reported", () => {
    const placed = placeWarnings([a, b], 1);
    assert.deepEqual(placed.onLabel, [a]);
    assert.deepEqual(placed.dropped, [b]);
    assert.deepEqual(placed.secondSticker, []);
  });
  it("a must-print warning is printed first", () => {
    assert.deepEqual(placeWarnings([a, must], 1).onLabel, [must]);
  });
  it("a must-print warning that does not fit goes on a second sticker", () => {
    const placed = placeWarnings([must, { ...must, text: "MUST 2" }, a], 1);
    assert.deepEqual(placed.secondSticker.map((w) => w.text), ["MUST 2"]);
    assert.deepEqual(placed.dropped, [a]);
  });
});

describe("sizes, dates and names", () => {
  it("presets keep their size; a custom size takes the nearest layout", () => {
    assert.deepEqual(labelSize({ labelPreset: "compact", labelWidthMm: null, labelHeightMm: null, labelRotate: false }), {
      preset: "compact",
      layout: "compact",
      widthMm: 70,
      heightMm: 50,
      rotate: false,
    });
    const custom = labelSize({ labelPreset: "custom", labelWidthMm: 75, labelHeightMm: 50, labelRotate: true });
    assert.equal(custom.layout, "compact");
    assert.equal(custom.widthMm, 75);
    assert.equal(custom.rotate, true);
    assert.equal(labelSize({ labelPreset: "custom", labelWidthMm: 98, labelHeightMm: 76, labelRotate: false }).layout, "xl");
  });
  it("Thai labels use the Buddhist year, English labels the Gregorian one", () => {
    const date = new Date("2026-11-17T05:00:00Z");
    assert.equal(labelDate(date, "th", "Asia/Bangkok"), "17 พ.ย. 2569");
    assert.equal(labelDate(date, "en", "Asia/Bangkok"), "17 Nov 2026");
  });
  it("generic names are capitalised, ingredient by ingredient", () => {
    assert.equal(titleCaseIngredients("amoxicillin"), "Amoxicillin");
    assert.equal(titleCaseIngredients("paracetamol + caffeine"), "Paracetamol + Caffeine");
  });
});

describe("licence number", () => {
  it("a typed prefix is not printed twice", async () => {
    const { licenseNumber } = await import("./label-layout");
    assert.equal(licenseNumber("ภ.12345"), "12345");
    assert.equal(licenseNumber(" ภ 12345 "), "12345");
    assert.equal(licenseNumber("Lic. 12345"), "12345");
    assert.equal(licenseNumber("12345"), "12345");
  });
});

describe("halves in the boxes", () => {
  it("prints ½ and 1½", () => {
    assert.deepEqual(defaultSlots(directions({ timesPerDayMax: 2, amountLow: 0.5, amountHigh: 0.5, amountUnit: "tablet" })), {
      morning: "½",
      noon: null,
      evening: "½",
      bedtime: null,
    });
    assert.equal(defaultSlots(directions({ timesPerDayMax: 1, amountLow: 1.5, amountHigh: 1.5 }))?.morning, "1½");
  });
});
