import { Badge } from "@/components/ui/card";
import type { drugInfo } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { DRUG_INFO_SECTIONS } from "@/lib/drug-sheet";

type DrugInfoRow = typeof drugInfo.$inferSelect;

const INFO_KEYS: Record<(typeof DRUG_INFO_SECTIONS)[number], MessageKey> = {
  indication: "drugDb.infoIndication",
  contraindications: "drugDb.infoContraindications",
  pregnancy: "drugDb.infoPregnancy",
  breastfeeding: "drugDb.infoBreastfeeding",
  elderly: "drugDb.infoElderly",
  kidney_liver: "drugDb.infoKidneyLiver",
  side_effects_common: "drugDb.infoSideEffectsCommon",
  side_effects_serious: "drugDb.infoSideEffectsSerious",
  food_alcohol_driving: "drugDb.infoFoodAlcoholDriving",
  counselling: "drugDb.infoCounselling",
  storage: "drugDb.infoStorage",
};

/**
 * The drug information cards of a product's ingredients (Drug info tab):
 * indication, cautions, side effects, counselling. Thai or English text,
 * falling back to the other language where a cell is empty.
 */
export async function DrugInfoCards({
  rows,
  lang,
  unapprovedBadge,
}: {
  rows: DrugInfoRow[];
  lang: "en" | "th";
  /** Shown on rows that are not approved (test screens only). */
  unapprovedBadge?: string;
}) {
  const t = await getT();
  const pick = (en?: string, th?: string) => (lang === "th" ? th || en : en || th);
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("drugDb.noDrugInfo")}</p>;
  }
  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <div key={`${row.ingredient}/${row.route}`} className="grid gap-2 rounded-lg border border-border p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">
              {row.ingredient}
              {row.nameTh && <span className="font-normal text-muted-foreground"> · {row.nameTh}</span>}
            </p>
            {!row.approved && unapprovedBadge && <Badge tone="warning">{unapprovedBadge}</Badge>}
          </div>
          {row.drugClass && <p className="text-muted-foreground">{row.drugClass}</p>}
          <dl className="grid gap-2">
            {DRUG_INFO_SECTIONS.map((section) => {
              const text = pick(row.sections[`${section}_en`], row.sections[`${section}_th`]);
              if (!text) return null;
              return (
                <div key={section}>
                  <dt className="text-xs font-medium text-muted-foreground">{t(INFO_KEYS[section])}</dt>
                  <dd className="whitespace-pre-line">{text}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}
