import { z } from "zod";
import { isCalendarDay } from "./dates";

/*
 * Zod building blocks for server-action form parsing. Error messages are
 * translation keys ("common.required"); turn them into text with
 * fieldErrorsFrom(error, (m) => t(m as MessageKey)).
 */

const trimmed = (v: unknown) => (typeof v === "string" ? v.trim() : v);
const blankToNull = (v: unknown) =>
  typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : (v ?? null);
const toNumber = (v: unknown) => {
  if (typeof v === "number") return v;
  if (typeof v !== "string" || v.trim() === "") return undefined;
  return Number(v);
};

/** Required, trimmed text. */
export const requiredText = (max = 200) =>
  z.preprocess(
    trimmed,
    z
      .string({ error: "common.required" })
      .min(1, "common.required")
      .max(max, "common.tooLong"),
  );

/** Optional text; blank becomes null. */
export const optionalText = (max = 1000) =>
  z.preprocess(blankToNull, z.string().max(max, "common.tooLong").nullable());

/** Optional email; blank becomes null. */
export const optionalEmail = z.preprocess(
  blankToNull,
  z.email("common.invalidEmail").max(200, "common.tooLong").nullable(),
);

export const requiredEmail = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.email("common.invalidEmail").max(200, "common.tooLong"),
);

/** Required number >= 0 (prices, costs). */
export const nonNegativeNumber = z.preprocess(
  toNumber,
  z.number({ error: "common.invalidNumber" }).min(0, "common.mustNotBeNegative"),
);

/** Required whole number >= 0. */
export const nonNegativeInt = z.preprocess(
  toNumber,
  z
    .number({ error: "common.invalidNumber" })
    .int("common.invalidNumber")
    .min(0, "common.mustNotBeNegative"),
);

/** Required whole number > 0 (quantities). */
export const positiveInt = z.preprocess(
  toNumber,
  z
    .number({ error: "common.invalidNumber" })
    .int("common.invalidNumber")
    .min(1, "common.mustBePositive"),
);

/** Optional calendar date as YYYY-MM-DD; blank becomes null. */
export const optionalDate = z.preprocess(
  blankToNull,
  z.string().refine(isCalendarDay, "common.invalidDate").nullable(),
);

/** Optional uuid (e.g. a <select> with an empty "none" option); blank becomes null. */
export const optionalId = z.preprocess(blankToNull, z.uuid("common.invalidChoice").nullable());

export const requiredId = z.uuid({ error: "common.required" });

/** Checkbox: "on" / "true" -> true, anything else -> false. */
export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** Plain object from FormData (last value wins for repeated names). */
export function formToObject(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData.entries());
}
