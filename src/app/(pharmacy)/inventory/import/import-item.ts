import type { CatalogDrug } from "@/lib/drug-catalog";

/*
 * A product waiting in the import queue. Values stay as typed (strings) until
 * importProducts validates them, so the queue can hold rows with mistakes.
 */
export type ImportItem = {
  key: string;
  name: string;
  genericName: string;
  manufacturer: string;
  dosageForm: string;
  strength: string;
  barcode: string;
  unit: string;
  category: string;
  salePrice: string;
  costPrice: string;
  reorderLevel: string;
  requiresPrescription: boolean;
  openingQuantity: string;
  openingBatchNumber: string;
  openingExpiryDate: string;
};

export const MAX_IMPORT_ROWS = 500;
export const MAX_BULK_NAMES = 30;
export const DEFAULT_REORDER_LEVEL = "10";

const BLANK: Omit<ImportItem, "key" | "name"> = {
  genericName: "",
  manufacturer: "",
  dosageForm: "",
  strength: "",
  barcode: "",
  unit: "",
  category: "",
  salePrice: "",
  costPrice: "",
  reorderLevel: DEFAULT_REORDER_LEVEL,
  requiresPrescription: false,
  openingQuantity: "",
  openingBatchNumber: "",
  openingExpiryDate: "",
};

export function itemFromDrug(drug: CatalogDrug): ImportItem {
  return {
    ...BLANK,
    key: `web-${drug.key}`,
    name: drug.name,
    genericName: drug.genericName ?? "",
    manufacturer: drug.manufacturer ?? "",
    dosageForm: drug.dosageForm ?? "",
    strength: drug.strength ?? "",
    unit: drug.unit,
    requiresPrescription: drug.requiresPrescription,
  };
}

/** CSV header -> item field. The template uses the first name of each. */
export const CSV_COLUMNS = {
  name: "name",
  generic_name: "genericName",
  manufacturer: "manufacturer",
  dosage_form: "dosageForm",
  strength: "strength",
  barcode: "barcode",
  unit: "unit",
  category: "category",
  sale_price: "salePrice",
  cost_price: "costPrice",
  reorder_level: "reorderLevel",
  requires_prescription: "requiresPrescription",
  opening_quantity: "openingQuantity",
  batch_number: "openingBatchNumber",
  expiry_date: "openingExpiryDate",
} as const satisfies Record<string, keyof ImportItem>;

const YES = new Set(["yes", "y", "true", "1", "rx", "ใช่"]);

/**
 * A spreadsheet date as YYYY-MM-DD. Excel often rewrites dates as D/M/YYYY,
 * and Thai Excel may use the Buddhist year (2569 = 2026). Anything else is
 * passed through for the server to reject.
 */
function normaliseDate(value: string): string {
  const v = value.trim();
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  const ymd = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(v);
  const parts = dmy ? [dmy[3], dmy[2], dmy[1]] : ymd ? [ymd[1], ymd[2], ymd[3]] : null;
  if (!parts) return v;
  const year = Number(parts[0]) > 2400 ? Number(parts[0]) - 543 : Number(parts[0]);
  return `${year}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
}

/** "Sale Price" / "sale-price" / "SALE_PRICE" -> "sale_price". */
const headerKey = (header: string) =>
  header.trim().toLowerCase().replace(/[\s-]+/g, "_");

/**
 * Queue items from parsed CSV rows (the first row is the header). Columns
 * that are not in CSV_COLUMNS are reported and ignored.
 */
export function itemsFromCsv(rows: string[][], fileKey: string) {
  const [header = [], ...data] = rows;
  const fields = header.map((h) =>
    headerKey(h) in CSV_COLUMNS ? CSV_COLUMNS[headerKey(h) as keyof typeof CSV_COLUMNS] : null,
  );
  const unknownColumns = header.filter((h, i) => h.trim() && !fields[i]);
  const hasName = fields.includes("name");

  const items: ImportItem[] = data.map((cells, index) => {
    const item: ImportItem = { ...BLANK, key: `${fileKey}-${index}`, name: "" };
    fields.forEach((field, i) => {
      const cell = (cells[i] ?? "").trim();
      if (!field) return;
      if (field === "requiresPrescription") item.requiresPrescription = YES.has(cell.toLowerCase());
      else if (field === "openingExpiryDate") item.openingExpiryDate = normaliseDate(cell);
      // Keep the default reorder level when the column is blank.
      else if (field === "reorderLevel") item.reorderLevel = cell || DEFAULT_REORDER_LEVEL;
      else item[field] = cell;
    });
    return item;
  });

  return { items, unknownColumns, hasName };
}
