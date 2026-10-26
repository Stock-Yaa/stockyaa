import { z } from "zod";
import {
  checkbox,
  nonNegativeInt,
  nonNegativeNumber,
  optionalDate,
  optionalId,
  optionalText,
  requiredText,
} from "./validation";

/*
 * Validation for product fields, shared by the product form and bulk import.
 * Error messages are translation keys.
 */

// Upper bounds that keep values inside the numeric(12,2) and integer columns.
const MAX_MONEY = 999_999_999;
const MAX_QUANTITY = 1_000_000;

const blankTo = (fallback: number) => (v: unknown) =>
  v == null || (typeof v === "string" && v.trim() === "") ? fallback : v;

const money = nonNegativeNumber.refine((v) => v <= MAX_MONEY, "products.numberTooLarge");
const wholeNumber = nonNegativeInt.refine(
  (v) => v <= MAX_QUANTITY,
  "products.numberTooLarge",
);

/** Product columns plus an optional opening batch (new products only). */
export const productFields = {
  name: requiredText(),
  genericName: optionalText(200),
  manufacturer: optionalText(200),
  dosageForm: optionalText(100),
  strength: optionalText(100),
  barcode: optionalText(100),
  unit: optionalText(30),
  salePrice: money,
  costPrice: z.preprocess(blankTo(0), money),
  reorderLevel: z.preprocess(blankTo(0), wholeNumber),
  requiresPrescription: checkbox,
  openingQuantity: z.preprocess(blankTo(0), wholeNumber),
  openingBatchNumber: optionalText(100),
  openingExpiryDate: optionalDate,
};

export const productSchema = z.object({
  id: optionalId,
  categoryId: optionalId,
  ...productFields,
});
