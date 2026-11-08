import { requirePharmacy } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { CSV_COLUMNS } from "../import-item";

/** The bulk import CSV template: every column, with two example rows. */
export async function GET() {
  await requirePharmacy();
  return csvResponse("stockyaa-products-template.csv", [
    Object.keys(CSV_COLUMNS),
    [
      "Paracetamol 500",
      "Paracetamol",
      "GPO",
      "Tablet",
      "500 mg",
      "8851234567890",
      "strip",
      "Pain relief",
      25,
      22,
      20,
      12,
      20,
      "no",
      100,
      "LOT-001",
      "2027-12-31",
    ],
    [
      "Amoxicillin 500",
      "Amoxicillin",
      "",
      "Capsule",
      "500 mg",
      "",
      "strip",
      "Antibiotics",
      60,
      55,
      "",
      35,
      10,
      "yes",
      "",
      "",
      "",
    ],
  ]);
}
