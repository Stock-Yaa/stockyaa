/*
 * Look-ups in public drug catalogues, used by bulk import: openFDA's NDC
 * directory (https://open.fda.gov/apis/drug/ndc/) for products, and RxNorm
 * (https://lhncbc.nlm.nih.gov/RxNav/) for spelling suggestions. Both are free
 * and need no key. Server-side only; results are US listings, so the user
 * checks them and sets their own prices before anything is saved.
 */

const NDC_URL = "https://api.fda.gov/drug/ndc.json";
const RXNORM_SPELLING_URL = "https://rxnav.nlm.nih.gov/REST/spellingsuggestions.json";
const TIMEOUT_MS = 8000;
// openFDA lists every repackager separately; fetch extra to fill a page after de-duplication.
const FETCH_LIMIT = 100;
export const RESULT_LIMIT = 30;

/** A catalogue product mapped onto Stockyaa's product fields. */
export type CatalogDrug = {
  key: string;
  name: string;
  genericName: string | null;
  manufacturer: string | null;
  dosageForm: string | null;
  strength: string | null;
  unit: string;
  requiresPrescription: boolean;
  drugClass: string | null;
};

/** Browse-by-category choices: key -> openFDA established pharmacologic class. */
export const DRUG_CLASSES = {
  painRelief: "Nonsteroidal Anti-inflammatory Drug",
  antibiotics: "Penicillin-class Antibacterial",
  macrolides: "Macrolide Antimicrobial",
  antihistamines: "Histamine-1 Receptor Antagonist",
  antacids: "Proton Pump Inhibitor",
  diabetes: "Biguanide",
  cholesterol: "HMG-CoA Reductase Inhibitor",
  bloodPressure: "Angiotensin 2 Receptor Blocker",
  calciumChannel: "Dihydropyridine Calcium Channel Blocker",
  steroids: "Corticosteroid",
  antidepressants: "Serotonin Reuptake Inhibitor",
} as const;
export type DrugClassKey = keyof typeof DRUG_CLASSES;

// International names people type in Thailand -> the US names openFDA uses.
const SYNONYMS: Record<string, string> = {
  paracetamol: "acetaminophen",
  salbutamol: "albuterol",
  adrenaline: "epinephrine",
  noradrenaline: "norepinephrine",
  glibenclamide: "glyburide",
  frusemide: "furosemide",
  lignocaine: "lidocaine",
  chlorphenamine: "chlorpheniramine",
  hyoscine: "scopolamine",
  pethidine: "meperidine",
};

type NdcProduct = {
  product_ndc?: string;
  brand_name?: string;
  generic_name?: string;
  labeler_name?: string;
  dosage_form?: string;
  product_type?: string;
  active_ingredients?: { name?: string; strength?: string }[];
  pharm_class?: string[];
};

/** "AMOXICILLIN" -> "Amoxicillin"; mixed-case text is left as it is. */
function tidyCase(value: string): string {
  if (value !== value.toUpperCase()) return value;
  return value
    .toLowerCase()
    .replace(/(^|[\s,(/-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** "TABLET, FILM COATED" -> "Tablet, film coated". */
function tidyForm(value: string): string {
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** "500 mg/1" -> "500 mg"; several ingredients are joined with " + ". */
function tidyStrength(ingredients: NdcProduct["active_ingredients"]): string | null {
  const parts = (ingredients ?? [])
    .map((i) => i.strength?.replace(/\/1$/, "").trim())
    .filter((s): s is string => Boolean(s));
  const joined = parts.join(" + ");
  return joined ? joined.slice(0, 100) : null;
}

/** A sensible counting unit for a dosage form; the user can change it. */
function unitFor(form: string | null): string {
  const f = (form ?? "").toLowerCase();
  if (f.includes("tablet")) return "tablet";
  if (f.includes("capsule")) return "capsule";
  if (/injection|injectable/.test(f)) return "vial";
  if (/solution|suspension|syrup|elixir|liquid/.test(f)) return "bottle";
  if (/cream|ointment|gel|paste/.test(f)) return "tube";
  if (f.includes("powder")) return "sachet";
  return "pcs";
}

function toCatalogDrug(p: NdcProduct): CatalogDrug | null {
  const name = p.brand_name?.trim() || p.generic_name?.trim();
  if (!name) return null;
  const dosageForm = p.dosage_form ? tidyForm(p.dosage_form) : null;
  const drugClass = p.pharm_class?.find((c) => c.endsWith("[EPC]"))?.replace(/\s*\[EPC\]$/, "");
  return {
    key: p.product_ndc ?? name,
    name: tidyCase(name).slice(0, 200),
    genericName: p.generic_name ? tidyCase(p.generic_name).slice(0, 200) : null,
    manufacturer: p.labeler_name?.slice(0, 200) ?? null,
    dosageForm: dosageForm?.slice(0, 100) ?? null,
    strength: tidyStrength(p.active_ingredients),
    unit: unitFor(dosageForm),
    requiresPrescription: p.product_type === "HUMAN PRESCRIPTION DRUG",
    drugClass: drugClass ?? null,
  };
}

/** One entry per name + strength + form, keeping openFDA's order. */
function dedupe(drugs: CatalogDrug[]): CatalogDrug[] {
  const seen = new Set<string>();
  return drugs.filter((d) => {
    const key = [d.name, d.strength, d.dosageForm].join("|").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Words of a search, lower-cased and limited to characters openFDA accepts. */
function words(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}.-]/gu, ""))
    .filter(Boolean)
    .slice(0, 6);
}

async function fetchNdc(search: string): Promise<NdcProduct[]> {
  // Finished medicines only: no bulk ingredients or veterinary products.
  const filter =
    'finished:true+AND+(product_type:"HUMAN+PRESCRIPTION+DRUG"+product_type:"HUMAN+OTC+DRUG")';
  const url = `${NDC_URL}?search=(${search})+AND+${filter}&limit=${FETCH_LIMIT}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (res.status === 404) return []; // openFDA's "No matches found!"
  if (!res.ok) throw new Error(`openFDA responded ${res.status}`);
  const body = (await res.json()) as { results?: NdcProduct[] };
  return body.results ?? [];
}

/**
 * Products matching every word of `query` (name, generic name or ingredient
 * starting with it), optionally within a drug class. Words with digits, like
 * "500", are matched against the strength instead.
 */
export async function searchCatalog(
  query: string,
  drugClass?: DrugClassKey,
): Promise<CatalogDrug[]> {
  const all = words(query);
  const textWords = all.filter((w) => !/\d/.test(w)).map((w) => SYNONYMS[w] ?? w);
  const numberWords = all.filter((w) => /\d/.test(w));

  const clauses = textWords.map((w) => {
    const term = encodeURIComponent(w);
    return `(brand_name:${term}*+generic_name:${term}*+active_ingredients.name:${term}*)`;
  });
  if (drugClass) {
    clauses.push(`pharm_class:"${encodeURIComponent(`${DRUG_CLASSES[drugClass]} [EPC]`)}"`);
  }
  if (clauses.length === 0) return [];

  const drugs = (await fetchNdc(clauses.join("+AND+")))
    .map(toCatalogDrug)
    .filter((d): d is CatalogDrug => d !== null)
    .filter((d) => numberWords.every((n) => d.strength?.toLowerCase().includes(n)));
  const wanted = textWords.join(" ");
  return dedupe(drugs)
    .map((drug, index) => ({ drug, index, rank: relevance(drug, wanted) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, RESULT_LIMIT)
    .map((entry) => entry.drug);
}

/**
 * Lower is better: an exact name first, then names starting with the search,
 * and single-ingredient products before combinations (plain acetaminophen
 * before cold-and-flu mixes).
 */
function relevance(drug: CatalogDrug, wanted: string): number {
  const name = drug.name.toLowerCase();
  const generic = drug.genericName?.toLowerCase() ?? "";
  const match =
    name === wanted || generic === wanted
      ? 0
      : name.startsWith(wanted)
        ? 1
        : generic.startsWith(wanted)
          ? 2
          : 3;
  const ingredients = drug.strength?.split(" + ").length ?? 1;
  return match * 10 + Math.min(ingredients, 9);
}

/** The best single match for a typed name (bulk add), or null. */
export async function findBestMatch(name: string): Promise<CatalogDrug | null> {
  const [best] = await searchCatalog(name);
  return best ?? null;
}

/** RxNorm's closest known drug name for a misspelling, if any. */
export async function spellingSuggestion(query: string): Promise<string | null> {
  try {
    const url = `${RXNORM_SPELLING_URL}?name=${encodeURIComponent(query.trim())}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      suggestionGroup?: { suggestionList?: { suggestion?: string[] } };
    };
    const suggestion = body.suggestionGroup?.suggestionList?.suggestion?.[0];
    return suggestion && suggestion.toLowerCase() !== query.trim().toLowerCase()
      ? suggestion
      : null;
  } catch {
    return null;
  }
}
