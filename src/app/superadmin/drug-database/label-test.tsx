import { Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { DrugInfoCards } from "@/components/drug-info-card";
import { Badge } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { createTranslator, getMessages, type MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { loadDrugData, loadDrugInfo, searchTmtProducts } from "@/lib/drug-database";
import { buildLabelText, type LabelLanguage } from "@/lib/drug-label";
import { suggestLabel, type NoDirectionsReason, type Patient } from "@/lib/dosing";

export type LabelTestParams = {
  q: string;
  tpu: string;
  group: string;
  years: string;
  months: string;
  weight: string;
  test: string;
  lang: string;
  ind: string;
};

const REASON_KEYS: Record<NoDirectionsReason, MessageKey> = {
  noGpu: "drugDb.reasonNoGpu",
  gpuNotApproved: "drugDb.reasonGpuNotApproved",
  noDoseMode: "drugDb.reasonNoDoseMode",
  needsAge: "drugDb.reasonNeedsAge",
  noRowFits: "drugDb.reasonNoRowFits",
  rowsTie: "drugDb.reasonRowsTie",
  rowNotApproved: "drugDb.reasonRowNotApproved",
  rowHasErrors: "drugDb.reasonRowHasErrors",
  needsWeight: "drugDb.reasonNeedsWeight",
  noDosePeriod: "drugDb.reasonNoDosePeriod",
  noTimesPerDay: "drugDb.reasonNoTimesPerDay",
  ruleNeedsOneIngredient: "drugDb.reasonRuleNeedsOneIngredient",
  noLeadIngredient: "drugDb.reasonNoLeadIngredient",
  noStrength: "drugDb.reasonNoStrength",
  unitMismatch: "drugDb.reasonUnitMismatch",
  noRoundTo: "drugDb.reasonNoRoundTo",
  roundingOff: "drugDb.reasonRoundingOff",
  noAmount: "drugDb.reasonNoAmount",
};

const wholeNumber = (v: string) => (/^\d{1,3}$/.test(v.trim()) ? Number(v) : null);
const num = (n: number) => String(Math.round(n * 100) / 100);

/** Search TMT, pick a product and a patient, and show the suggested label. */
export async function LabelTest({ params }: { params: LabelTestParams }) {
  const [t, db] = await Promise.all([getT(), getDb()]);

  // The patient form has been sent once `group` is in the URL; until then
  // test mode is on, since nothing in the sheet is approved yet.
  const submitted = params.group !== "";
  const group: Patient["group"] = params.group === "child" ? "child" : "adult";
  const years = wholeNumber(params.years);
  const months = wholeNumber(params.months);
  const ageMonths = years === null && months === null ? null : (years ?? 0) * 12 + (months ?? 0);
  const weightValue = Number(params.weight.replace(",", "."));
  const weightKg = params.weight.trim() && weightValue > 0 && weightValue < 500 ? weightValue : null;
  const test = submitted ? params.test === "1" : true;
  const lang: LabelLanguage = params.lang === "en" ? "en" : "th";
  const indication = params.ind !== "" && /^\d+$/.test(params.ind) ? Number(params.ind) : undefined;
  const tpu = /^\d{1,9}$/.test(params.tpu) ? Number(params.tpu) : null;

  const results = params.q && tpu === null ? await searchTmtProducts(db, params.q) : [];
  const data = tpu !== null ? await loadDrugData(db, tpu) : null;

  const link = (patch: Partial<LabelTestParams>) => {
    const merged = { ...params, ...patch };
    const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v !== ""));
    return `?${qs.toString()}`;
  };

  return (
    <div className="grid gap-5">
      <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label={t("drugDb.searchLabel")} htmlFor="drug-q" className="min-w-0 flex-1">
          <Input
            id="drug-q"
            name="q"
            type="search"
            defaultValue={params.q}
            placeholder={t("drugDb.searchPlaceholder")}
          />
        </Field>
        <Button type="submit" variant="outline">
          <Search />
          {t("drugDb.search")}
        </Button>
      </form>

      {params.q && tpu === null && (
        results.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("drugDb.noResults", { query: params.q })}</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t("drugDb.colTradeName")}</TH>
                <TH>{t("drugDb.colManufacturer")}</TH>
                <TH>{t("drugDb.colGpu")}</TH>
                <TH className="text-right">{t("drugDb.colTpu")}</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {results.map((r) => (
                <TR key={r.tpuId}>
                  <TD className="font-medium">{r.tradeName}</TD>
                  <TD className="text-muted-foreground">{r.manufacturer ?? "—"}</TD>
                  <TD className="text-muted-foreground">{r.gpuName ?? r.gpuId}</TD>
                  <TD className="text-right tabular-nums">{r.tpuId}</TD>
                  <TD className="text-right">
                    <Link href={link({ tpu: String(r.tpuId), ind: "" })} className={buttonClass({ variant: "outline", size: "sm" })}>
                      {t("drugDb.choose")}
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      )}

      {tpu !== null && !data && (
        <p className="text-sm text-destructive">{t("drugDb.unknownTpu", { tpu })}</p>
      )}

      {data && (
        <>
          <form method="get" className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-6">
            <input type="hidden" name="q" value={params.q} />
            <input type="hidden" name="tpu" value={String(tpu)} />
            <Field label={t("drugDb.patient")} htmlFor="drug-group" className="sm:col-span-2">
              <Select id="drug-group" name="group" defaultValue={group}>
                <option value="adult">{t("drugDb.adult")}</option>
                <option value="child">{t("drugDb.child")}</option>
              </Select>
            </Field>
            <Field label={t("drugDb.ageYears")} htmlFor="drug-years">
              <Input id="drug-years" name="years" type="number" min={0} max={120} inputMode="numeric" defaultValue={params.years} />
            </Field>
            <Field label={t("drugDb.ageMonths")} htmlFor="drug-months">
              <Input id="drug-months" name="months" type="number" min={0} max={11} inputMode="numeric" defaultValue={params.months} />
            </Field>
            <Field label={t("drugDb.weight")} htmlFor="drug-weight" hint={t("drugDb.weightHint")} className="sm:col-span-2">
              <Input id="drug-weight" name="weight" type="number" min={0} step="0.1" inputMode="decimal" defaultValue={params.weight} />
            </Field>
            <Field label={t("drugDb.labelLanguage")} htmlFor="drug-lang" className="sm:col-span-2">
              <Select id="drug-lang" name="lang" defaultValue={lang}>
                <option value="th">{t("drugDb.langTh")}</option>
                <option value="en">{t("drugDb.langEn")}</option>
              </Select>
            </Field>
            <label className="flex items-start gap-2 text-sm sm:col-span-3 sm:mt-7">
              <input type="checkbox" name="test" value="1" defaultChecked={test} className="mt-0.5 size-4 accent-primary" />
              <span>
                <span className="font-medium">{t("drugDb.includeUnapproved")}</span>
                <span className="block text-xs text-muted-foreground">{t("drugDb.includeUnapprovedHint")}</span>
              </span>
            </label>
            <div className="sm:col-span-1 sm:mt-6.5">
              <Button type="submit" className="w-full">{t("drugDb.showLabel")}</Button>
            </div>
          </form>

          <LabelResult
            data={data}
            patient={{ group, ageMonths, weightKg }}
            test={test}
            lang={lang}
            indication={indication}
            link={link}
          />
        </>
      )}
    </div>
  );
}

async function LabelResult({
  data,
  patient,
  test,
  lang,
  indication,
  link,
}: {
  data: NonNullable<Awaited<ReturnType<typeof loadDrugData>>>;
  patient: Patient;
  test: boolean;
  lang: LabelLanguage;
  indication: number | undefined;
  link: (patch: Partial<LabelTestParams>) => string;
}) {
  const [t, db] = await Promise.all([getT(), getDb()]);
  const s = suggestLabel(data, patient, { includeUnapproved: test, indication });
  const label = buildLabelText(s, createTranslator(getMessages(lang)), lang);
  const d = s.directions;
  const info = (
    await loadDrugInfo(db, [...new Set(data.ingredients.map((i) => i.ingredient))], s.gpu?.route ?? null)
  ).filter((row) => row.approved || test);
  const pick = (en?: string, th?: string) => (lang === "th" ? th || en : en || th);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{t("drugDb.labelPreview")}</h3>
          {s.usedUnapproved && <Badge tone="warning">{t("drugDb.testModeBadge")}</Badge>}
        </div>

        <div className="grid gap-2 rounded-lg border-2 border-foreground/70 bg-card p-4 text-sm">
          <p className="text-base font-semibold">{label.medicine}</p>
          {label.indication && <p>{label.indication}</p>}
          {label.directions.map((line, i) => (
            <p key={i} className={i === 0 ? "text-base font-semibold" : undefined}>{line}</p>
          ))}
          {label.limits.map((line, i) => <p key={i}>{line}</p>)}
          {label.note && <p className="text-muted-foreground">{label.note}</p>}
          {!d && (
            <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground">
              {t("drugDb.noDirections")}
              {s.reason && <span className="block text-foreground">{t(REASON_KEYS[s.reason])}</span>}
            </p>
          )}
          {label.warnings.length > 0 && (
            <ul className="grid gap-1 border-t border-border pt-2">
              {label.warnings.map((w, i) => (
                <li key={i} className="flex gap-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {s.indicationChoices.length > 0 && (
          <div className="grid gap-2">
            <p className="text-sm">{t("drugDb.chooseIndication")}</p>
            <div className="flex flex-wrap gap-2">
              {s.indicationChoices.map((c, i) => (
                <Link
                  key={i}
                  href={link({ ind: String(i) })}
                  className={buttonClass({ variant: indication === i ? "primary" : "outline", size: "sm" })}
                >
                  {pick(c.indicationEn ?? undefined, c.indicationTh ?? undefined) || `#${i + 1}`}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-1 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">{t("drugDb.howItWasWorkedOut")}</p>
          <p>
            {t("drugDb.chain", { tpu: s.product.tpuId, gpu: s.product.gpuId })}
            {s.gpu && ` · ${s.gpu.gpuName}`}
          </p>
          {d && (
            <p>
              {t("drugDb.doseFrom")}:{" "}
              {d.source === "gpu"
                ? t("drugDb.doseModeFixed", { row: d.sheetRow })
                : t("drugDb.doseModeDosing", { row: d.sheetRow, mode: s.doseMode ?? "" })}
            </p>
          )}
          {d?.calculation && (
            <p>
              {t("drugDb.calculation", {
                dose:
                  d.calculation.doseLow === d.calculation.doseHigh
                    ? `${num(d.calculation.doseLow)} ${d.calculation.doseUnit}`
                    : `${num(d.calculation.doseLow)}–${num(d.calculation.doseHigh)} ${d.calculation.doseUnit}`,
                ingredient: d.calculation.ingredient,
                strength: d.calculation.strength ?? "—",
                exact:
                  d.calculation.exactLow === d.calculation.exactHigh
                    ? num(d.calculation.exactLow)
                    : `${num(d.calculation.exactLow)}–${num(d.calculation.exactHigh)}`,
                amount: d.amountLow === d.amountHigh ? num(d.amountLow) : `${num(d.amountLow)}–${num(d.amountHigh)}`,
                unit: d.amountUnit,
              })}
            </p>
          )}
        </div>
      </div>

      <div className="grid content-start gap-3">
        <h3 className="text-sm font-semibold">{t("drugDb.drugInfoTitle")}</h3>
        <DrugInfoCards rows={info} lang={lang} unapprovedBadge={t("drugDb.testModeBadge")} />
      </div>
    </div>
  );
}
