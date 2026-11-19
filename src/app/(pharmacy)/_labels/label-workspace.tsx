"use client";

import { Info, Printer, TriangleAlert } from "lucide-react";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  DispensingSticker,
  MeasureSticker,
  Rotated,
  STICKER_CSS,
  fitFrom,
  type DropLevel,
  type Fit,
  type FitResults,
} from "@/components/dispensing-sticker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import {
  PRESET_SPECS,
  SLOTS,
  hasSlots,
  missingItems,
  placeWarnings,
  type LabelContent,
  type LabelLanguage,
  type LabelSize,
  type LabelWarning,
  type RequiredItem,
  type Slots,
  type StickerWords,
} from "@/lib/label-layout";
import { cn } from "@/lib/utils";
import { recordPrintedLabels } from "./actions";
import type { LabelDraft } from "./build";

/** What every label of the page shares: pharmacy, patient, date, pharmacist. */
export type LabelCommon = {
  language: LabelLanguage;
  pharmacyName: string;
  pharmacyAddress: string;
  pharmacyPhone: string;
  logo: string | null;
  patientName: string;
  date: string;
  pharmacistId: string | null;
  pharmacistName: string;
  pharmacistLicense: string;
};

type EditState = {
  include: boolean;
  drugName: string;
  strength: string;
  noStrength: boolean;
  quantity: string;
  indication: string;
  directions: string;
  slots: Slots | null;
  warnings: LabelWarning[];
  /** The pharmacist edited the warnings: texts missing in this language are their call now. */
  warningsEdited: boolean;
};

const REQUIRED_KEYS: Record<RequiredItem, MessageKey> = {
  pharmacyName: "dispensing.requiredPharmacyName",
  pharmacyAddress: "dispensing.requiredPharmacyAddress",
  pharmacyPhone: "dispensing.requiredPharmacyPhone",
  patientName: "dispensing.requiredPatientName",
  drugName: "dispensing.requiredDrugName",
  strength: "dispensing.requiredStrength",
  quantity: "dispensing.requiredQuantity",
  indication: "dispensing.requiredIndication",
  directions: "dispensing.requiredDirections",
  pharmacistName: "dispensing.requiredPharmacist",
  pharmacistLicense: "dispensing.requiredLicense",
};

const SLOT_KEYS: Record<(typeof SLOTS)[number], MessageKey> = {
  morning: "dispensing.slotMorning",
  noon: "dispensing.slotNoon",
  evening: "dispensing.slotEvening",
  bedtime: "dispensing.slotBedtime",
};

const EMPTY_SLOTS: Slots = { morning: null, noon: null, evening: null, bedtime: null };

/** One label, worked out: its content, the warnings that did not fit, what blocks printing. */
type Worked = {
  draft: LabelDraft;
  edit: EditState;
  content: LabelContent;
  fit: Fit | null;
  secondSticker: LabelWarning[];
  blockers: string[];
  notices: string[];
};

export function LabelWorkspace({
  drafts,
  common,
  size,
  words,
  record,
}: {
  drafts: LabelDraft[];
  common: LabelCommon;
  size: LabelSize;
  words: StickerWords;
  record: { branchId: string; saleId: string | null };
}) {
  const t = useT();
  const spec = PRESET_SPECS[size.layout];
  const [edits, setEdits] = useState<Record<string, EditState>>(() =>
    Object.fromEntries(
      drafts.map((d) => [
        d.key,
        {
          include: d.include,
          drugName: d.drugName,
          strength: d.strength,
          noStrength: d.noStrength,
          quantity: d.quantity,
          indication: d.indication,
          directions: d.directions,
          slots: d.slots,
          warnings: d.warnings,
          warningsEdited: false,
        },
      ]),
    ),
  );
  const [fits, setFits] = useState<Record<string, FitResults>>({});
  const [printing, startPrinting] = useTransition();

  const update = (key: string, patch: Partial<EditState>) =>
    setEdits((all) => ({ ...all, [key]: { ...all[key], ...patch } }));
  const onMeasure = useCallback(
    (key: string) => (level: DropLevel, overflow: boolean) =>
      setFits((all) => (all[key]?.[level] === overflow ? all : { ...all, [key]: { ...all[key], [level]: overflow } })),
    [],
  );
  // One stable callback per label, so the measured copies are not re-attached on every render.
  const measureCallbacks = useMemo(
    () => Object.fromEntries(drafts.map((d) => [d.key, onMeasure(d.key)])),
    [drafts, onMeasure],
  );

  const worked: Worked[] = drafts.map((draft) => {
    const edit = edits[draft.key];
    const placed = placeWarnings(
      edit.warnings.filter((w) => w.text.trim() !== "").map((w) => ({ ...w, text: w.text.trim() })),
      spec.warnings,
    );
    const content: LabelContent = {
      language: common.language,
      pharmacyName: common.pharmacyName,
      pharmacyAddress: common.pharmacyAddress,
      pharmacyPhone: common.pharmacyPhone,
      logo: common.logo,
      patientName: common.patientName,
      date: common.date,
      drugName: edit.drugName,
      strength: edit.strength,
      noStrength: edit.noStrength,
      thaiName: draft.thaiName,
      quantity: edit.quantity,
      indication: edit.indication,
      directions: edit.directions,
      slots: hasSlots(edit.slots) ? edit.slots : null,
      warnings: placed.onLabel,
      pharmacistName: common.pharmacistName,
      pharmacistLicense: common.pharmacistLicense,
    };
    const fit = fitFrom(fits[draft.key]);
    const secondSticker = [...placed.secondSticker];
    const notices: string[] = placed.dropped.map((w) => t("dispensing.warningNotPrinted", { text: w.text }));
    if (fit && fit.level >= 1 && spec.logo && content.logo) notices.push(t("dispensing.logoDropped"));
    if (fit && fit.level >= 2 && spec.thaiName && content.language === "th" && content.thaiName) {
      notices.push(t("dispensing.thaiNameDropped"));
    }
    if (fit && fit.level >= 3 && placed.onLabel.length > 1) {
      // The second warning goes to a sticker of its own if it must be printed.
      for (const w of placed.onLabel.slice(1)) {
        if (w.mustPrint) secondSticker.push(w);
        else notices.push(t("dispensing.warningNotPrinted", { text: w.text }));
      }
    }
    if (secondSticker.length > 0) notices.push(t("dispensing.secondSticker", { count: secondSticker.length }));
    const blockers = missingItems(content).map((item) => t(REQUIRED_KEYS[item]));
    if (draft.missingText.length > 0 && !edit.warningsEdited) {
      blockers.push(t("dispensing.missingText", { items: draft.missingText.join(", ") }));
    }
    if (fit?.overflow) blockers.push(t("dispensing.doesNotFit"));
    return { draft, edit, content, fit, secondSticker, blockers, notices };
  });
  const chosen = worked.filter((w) => w.edit.include);
  const blocked = chosen.some((w) => w.blockers.length > 0 || w.fit === null);

  function print() {
    if (blocked || chosen.length === 0 || !common.pharmacistId) return;
    startPrinting(async () => {
      const result = await recordPrintedLabels({
        branchId: record.branchId,
        saleId: record.saleId,
        pharmacistId: common.pharmacistId!,
        patientName: common.patientName,
        language: common.language,
        preset: size.preset,
        labels: chosen.map((w) => ({
          productId: w.draft.productId,
          drugName: w.content.drugName,
          strength: w.content.noStrength ? "" : w.content.strength,
          quantity: w.content.quantity,
          indication: w.content.indication,
          directions: w.content.directions,
          slots: w.content.slots,
          warnings: (w.fit && w.fit.level >= 3 ? w.content.warnings.slice(0, 1) : w.content.warnings).map((x) => x.text),
          secondSticker: w.secondSticker.map((x) => x.text),
          thai: w.draft.thai ?? null,
        })),
      });
      if (!result?.ok) {
        toast.error(result?.message ?? t("common.somethingWrong"));
        return;
      }
      window.print();
    });
  }

  const page = size.rotate ? `${size.heightMm}mm ${size.widthMm}mm` : `${size.widthMm}mm ${size.heightMm}mm`;
  const stickerCount = chosen.reduce((n, w) => n + 1 + (w.secondSticker.length > 0 ? 1 : 0), 0);

  return (
    <>
      <style>{`${STICKER_CSS}\n@page { size: ${page}; margin: 0; }`}</style>

      <div className="grid gap-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("dispensing.sizeHintPreset", { width: size.widthMm, height: size.heightMm })}
          </p>
          <Button onClick={print} disabled={blocked || chosen.length === 0 || printing}>
            <Printer />
            {t("dispensing.print", { count: stickerCount })}
          </Button>
        </div>
        {chosen.length === 0 && <p className="text-sm text-warning">{t("dispensing.nothingToPrint")}</p>}
        {blocked && chosen.length > 0 && <p className="text-sm text-destructive">{t("dispensing.blockedHint")}</p>}

        {worked.map((w) => (
          <LabelCard
            key={w.draft.key}
            worked={w}
            size={size}
            words={words}
            onMeasure={measureCallbacks[w.draft.key]}
            update={(patch) => update(w.draft.key, patch)}
          />
        ))}
      </div>

      {/* What the printer gets: the ticked labels, one per page, then any warnings sticker. */}
      <div className="hidden print:block">
        {chosen.flatMap((w) => {
          const pages = [
            <div key={`${w.draft.key}-main`} className="break-before-page first:break-before-auto">
              <Rotated size={size}>
                <DispensingSticker content={w.content} size={{ ...size, rotate: false }} words={words} level={w.fit?.level ?? 0} />
              </Rotated>
            </div>,
          ];
          if (w.secondSticker.length > 0) {
            pages.push(
              <div key={`${w.draft.key}-warnings`} className="break-before-page">
                <Rotated size={size}>
                  <DispensingSticker
                    content={{ ...w.content, warnings: w.secondSticker }}
                    size={{ ...size, rotate: false }}
                    words={words}
                    level={2}
                    warningsOnly
                  />
                </Rotated>
              </div>,
            );
          }
          return pages;
        })}
      </div>
    </>
  );
}

function LabelCard({
  worked,
  size,
  words,
  onMeasure,
  update,
}: {
  worked: Worked;
  size: LabelSize;
  words: StickerWords;
  onMeasure: (level: DropLevel, overflow: boolean) => void;
  update: (patch: Partial<EditState>) => void;
}) {
  const t = useT();
  const { draft, edit, content, fit, blockers, notices } = worked;
  const id = (name: string) => `${name}-${draft.key}`;
  const slotsOn = edit.slots !== null;

  return (
    <Card className={cn(!edit.include && "opacity-70")}>
      <CardContent className="grid gap-5 lg:grid-cols-[1fr_auto]">
        <div className="grid content-start gap-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={edit.include}
              onChange={(e) => update({ include: e.target.checked })}
              className="size-4 accent-primary"
            />
            {t("dispensing.include")}
          </label>
          <p
            className={cn(
              "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
              draft.suggested ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
            )}
          >
            {draft.suggested ? <Info className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
            {draft.status}
          </p>
          {draft.notice && (
            <p className="flex items-start gap-2 rounded-md bg-warning/15 px-3 py-2 text-sm text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {draft.notice}
            </p>
          )}
          {draft.note && (
            <p className="rounded-md border border-border px-3 py-2 text-sm">
              <span className="font-medium">{t("dispensing.pharmacistNote")}: </span>
              {draft.note}
            </p>
          )}
          {draft.choices}
          {edit.include && blockers.length > 0 && (
            <ul className="grid gap-1 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
              {blockers.map((b, i) => (
                <li key={i}>• {b}</li>
              ))}
            </ul>
          )}
          {edit.include && notices.length > 0 && (
            <ul className="grid gap-1 rounded-md bg-warning/15 px-3 py-2 text-sm text-warning">
              {notices.map((n, i) => (
                <li key={i}>• {n}</li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem]">
            <Field label={t("dispensing.medicine")} htmlFor={id("m")}>
              <Input id={id("m")} value={edit.drugName} onChange={(e) => update({ drugName: e.target.value })} />
            </Field>
            <Field label={t("dispensing.strength")} htmlFor={id("s")}>
              <Input
                id={id("s")}
                value={edit.strength}
                disabled={edit.noStrength}
                onChange={(e) => update({ strength: e.target.value })}
              />
            </Field>
            <Field label={t("dispensing.quantity")} htmlFor={id("q")}>
              <Input id={id("q")} value={edit.quantity} onChange={(e) => update({ quantity: e.target.value })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={edit.noStrength}
              onChange={(e) => update({ noStrength: e.target.checked })}
              className="size-4 accent-primary"
            />
            {t("dispensing.noStrength")}
          </label>
          <Field label={t("dispensing.indication")} htmlFor={id("i")}>
            <Input id={id("i")} value={edit.indication} onChange={(e) => update({ indication: e.target.value })} />
          </Field>
          <Field label={t("dispensing.directions")} htmlFor={id("d")} hint={t("dispensing.directionsHintMain")}>
            <Textarea id={id("d")} rows={3} value={edit.directions} onChange={(e) => update({ directions: e.target.value })} />
          </Field>
          <fieldset className="grid gap-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={slotsOn}
                onChange={(e) => update({ slots: e.target.checked ? (edit.slots ?? EMPTY_SLOTS) : null })}
                className="size-4 accent-primary"
              />
              {t("dispensing.slotsToggle")}
            </label>
            {slotsOn && (
              <div className="grid grid-cols-4 gap-2">
                {SLOTS.map((slot) => (
                  <Field key={slot} label={t(SLOT_KEYS[slot])} htmlFor={id(slot)}>
                    <Input
                      id={id(slot)}
                      value={edit.slots?.[slot] ?? ""}
                      placeholder="–"
                      onChange={(e) =>
                        update({ slots: { ...(edit.slots ?? EMPTY_SLOTS), [slot]: e.target.value.trim() || null } })
                      }
                    />
                  </Field>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t("dispensing.slotsHint")}</p>
          </fieldset>
          <Field label={t("dispensing.warnings")} htmlFor={id("w")} hint={t("dispensing.warningsHint")}>
            <Textarea
              id={id("w")}
              rows={2}
              value={edit.warnings.map((w) => w.text).join("\n")}
              onChange={(e) =>
                update({
                  warningsEdited: true,
                  warnings: e.target.value
                    .split("\n")
                    .map((text, i) => ({ text, mustPrint: edit.warnings[i]?.mustPrint ?? false }))
                    .filter((w, i, all) => w.text.trim() !== "" || i === all.length - 1),
                })
              }
            />
          </Field>
          {draft.info && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">{t("dispensing.drugInfo")}</summary>
              <div className="mt-3">{draft.info}</div>
            </details>
          )}
        </div>
        <div className="grid content-start justify-items-center gap-2 overflow-x-auto">
          <p className="text-xs font-medium text-muted-foreground">{t("dispensing.preview")}</p>
          <DispensingSticker content={content} size={{ ...size, rotate: false }} words={words} level={fit?.level ?? 0} />
          {worked.secondSticker.length > 0 && (
            <DispensingSticker
              content={{ ...content, warnings: worked.secondSticker }}
              size={{ ...size, rotate: false }}
              words={words}
              level={2}
              warningsOnly
            />
          )}
          <MeasureSticker content={content} size={size} words={words} onMeasure={onMeasure} />
        </div>
      </CardContent>
    </Card>
  );
}
