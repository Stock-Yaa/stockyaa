"use client";

import { Info, Printer, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** One label as first suggested; the pharmacist edits it before printing. */
export type LabelDraft = {
  key: string;
  include: boolean;
  medicine: string;
  quantity: string;
  indication: string;
  /** One printed line per line. */
  directions: string;
  warnings: string;
  /** Where the directions came from, or why there are none. */
  status: string;
  suggested: boolean;
  /** Buttons to pick what the medicine is for (server-rendered links). */
  choices?: React.ReactNode;
  /** The ingredients' drug information cards (server-rendered). */
  info?: React.ReactNode;
};

type Header = { pharmacyName: string; phone: string; date: string; patientName: string; pharmacist: string };
type Captions = { patient: string; date: string; quantity: string; pharmacist: string; indication: string };

// The sticker: 50 × 70 mm, one per printed page.
const PAGE_CSS = "@page { size: 50mm 70mm; margin: 0; }";
const LABEL_SIZE = { width: "50mm", height: "70mm" };

// On paper the label is black on white whatever the screen theme.
const PRINT_COLOURS =
  "print:[--card:#fff] print:[--card-foreground:#000] print:[--foreground:#000] " +
  "print:[--muted-foreground:#000] print:[--border:#000]";

export function LabelSheet({
  drafts,
  header,
  captions,
}: {
  drafts: LabelDraft[];
  header: Header;
  captions: Captions;
}) {
  const t = useT();
  const [labels, setLabels] = useState(drafts);
  const update = (key: string, patch: Partial<LabelDraft>) =>
    setLabels((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const chosen = labels.filter((l) => l.include);

  return (
    <>
      <style>{PAGE_CSS}</style>

      <div className="grid gap-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("dispensing.sizeHint")} {t("dispensing.cutOffHint")}
          </p>
          <Button onClick={() => window.print()} disabled={chosen.length === 0}>
            <Printer />
            {t("dispensing.print", { count: chosen.length })}
          </Button>
        </div>
        {chosen.length === 0 && <p className="text-sm text-warning">{t("dispensing.nothingToPrint")}</p>}

        {labels.map((label) => (
          <Card key={label.key} className={cn(!label.include && "opacity-70")}>
            <CardContent className="grid gap-5 lg:grid-cols-[1fr_auto]">
              <div className="grid content-start gap-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={label.include}
                    onChange={(e) => update(label.key, { include: e.target.checked })}
                    className="size-4 accent-primary"
                  />
                  {t("dispensing.include")}
                </label>
                <p
                  className={cn(
                    "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
                    label.suggested ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                  )}
                >
                  {label.suggested ? <Info className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
                  {label.status}
                </p>
                {label.choices}
                <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                  <Field label={t("dispensing.medicine")} htmlFor={`m-${label.key}`}>
                    <Input
                      id={`m-${label.key}`}
                      value={label.medicine}
                      onChange={(e) => update(label.key, { medicine: e.target.value })}
                    />
                  </Field>
                  <Field label={t("dispensing.quantity")} htmlFor={`q-${label.key}`}>
                    <Input
                      id={`q-${label.key}`}
                      value={label.quantity}
                      onChange={(e) => update(label.key, { quantity: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label={t("dispensing.indication")} htmlFor={`i-${label.key}`}>
                  <Input
                    id={`i-${label.key}`}
                    value={label.indication}
                    onChange={(e) => update(label.key, { indication: e.target.value })}
                  />
                </Field>
                <Field label={t("dispensing.directions")} htmlFor={`d-${label.key}`} hint={t("dispensing.directionsHint")}>
                  <Textarea
                    id={`d-${label.key}`}
                    rows={4}
                    value={label.directions}
                    onChange={(e) => update(label.key, { directions: e.target.value })}
                  />
                </Field>
                <Field label={t("dispensing.warnings")} htmlFor={`w-${label.key}`}>
                  <Textarea
                    id={`w-${label.key}`}
                    rows={2}
                    value={label.warnings}
                    onChange={(e) => update(label.key, { warnings: e.target.value })}
                  />
                </Field>
                {label.info && (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">{t("dispensing.drugInfo")}</summary>
                    <div className="mt-3">{label.info}</div>
                  </details>
                )}
              </div>
              <div className="grid content-start justify-items-center gap-2">
                <p className="text-xs font-medium text-muted-foreground">{t("dispensing.preview")}</p>
                <div className="[zoom:1.3]">
                  <PrintedLabel label={label} header={header} captions={captions} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* What the printer gets: only the ticked labels, one per page. */}
      <div className={cn("hidden print:block", PRINT_COLOURS)}>
        {chosen.map((label) => (
          // A break before every label but the first: no blank page at the end.
          <div key={label.key} className="break-before-page first:break-before-auto">
            <PrintedLabel label={label} header={header} captions={captions} />
          </div>
        ))}
      </div>
    </>
  );
}

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

function PrintedLabel({ label, header, captions }: { label: LabelDraft; header: Header; captions: Captions }) {
  return (
    <div
      style={{ ...LABEL_SIZE, padding: "2.5mm", fontSize: "7.5pt", lineHeight: 1.25 }}
      className="flex flex-col overflow-hidden rounded-sm border border-border bg-card text-card-foreground print:rounded-none print:border-0"
    >
      <div className="border-b border-border pb-[1mm] text-center">
        <p className="font-semibold" style={{ fontSize: "8pt" }}>{header.pharmacyName}</p>
        {header.phone && <p>{header.phone}</p>}
      </div>
      <div className="flex justify-between gap-[1mm] pt-[1mm]">
        <p className="min-w-0 truncate">
          {captions.patient}: {header.patientName || "……………"}
        </p>
        <p className="shrink-0">{header.date}</p>
      </div>
      <p className="pt-[1mm] font-semibold" style={{ fontSize: "8.5pt" }}>{label.medicine}</p>
      {label.quantity && (
        <p>
          {captions.quantity}: {label.quantity}
        </p>
      )}
      {label.indication && (
        <p>
          {captions.indication}: {label.indication}
        </p>
      )}
      <div className="pt-[1mm] font-semibold" style={{ fontSize: "8.5pt" }}>
        {lines(label.directions).map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
      {lines(label.warnings).length > 0 && (
        <div className="mt-[1mm] border-t border-border pt-[1mm]" style={{ fontSize: "7pt" }}>
          {lines(label.warnings).map((line, i) => (
            <p key={i}>⚠ {line}</p>
          ))}
        </div>
      )}
      <p className="mt-auto pt-[1mm] text-right" style={{ fontSize: "6.5pt" }}>
        {captions.pharmacist}: {header.pharmacist}
      </p>
    </div>
  );
}
