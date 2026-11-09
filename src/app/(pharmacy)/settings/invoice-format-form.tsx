"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import {
  INVOICE_DATE_FORMAT_OPTIONS,
  INVOICE_PREFIX_PATTERN,
  MAX_INVOICE_DIGITS,
  MAX_INVOICE_PREFIX,
  MIN_INVOICE_DIGITS,
  formatInvoiceNumber,
  invoicePeriod,
  type InvoiceDateFormat,
} from "@/lib/invoice-number";
import type { NumberSeries } from "@/lib/numbering";
import { previewDocumentNumbers, updateInvoiceFormat } from "./actions";

type PrefixField = "invoicePrefix" | "taxInvoicePrefix" | "creditNotePrefix" | "purchasePrefix" | "transferPrefix";

type Settings = Record<PrefixField, string> & {
  invoiceDateFormat: InvoiceDateFormat;
  invoiceBuddhistYear: boolean;
  invoiceDigits: number;
  numberPerBranch: boolean;
};

/** Where a series' counter is now in the current branch, and the prefix it counts for. */
type Counter = { seq: number; period: string; prefix: string };

const SERIES: { series: NumberSeries; field: PrefixField; label: MessageKey; next: MessageKey; hint?: MessageKey }[] = [
  { series: "sale", field: "invoicePrefix", label: "settings.invoicePrefix", next: "settings.invoiceNext", hint: "settings.invoicePrefixHint" },
  { series: "tax", field: "taxInvoicePrefix", label: "settings.taxInvoicePrefix", next: "settings.taxInvoiceNext" },
  { series: "credit", field: "creditNotePrefix", label: "settings.creditNotePrefix", next: "settings.creditNoteNext" },
  { series: "purchase", field: "purchasePrefix", label: "settings.purchasePrefix", next: "settings.purchaseNext" },
  { series: "transfer", field: "transferPrefix", label: "settings.transferPrefix", next: "settings.transferNext" },
];

/**
 * Prefixes of each kind of document (sales, tax receipts, credit notes,
 * purchase orders, transfers), the shared date part and digits, and whether
 * each branch has its own numbers, with a live preview of the next numbers
 * in the current branch. `today` is the pharmacy's calendar day.
 */
export function InvoiceFormatForm({
  settings,
  today,
  branchCode,
  counters,
  showTransfers,
}: {
  settings: Settings;
  today: string;
  /** The current branch's code, used in numbers per branch. */
  branchCode: string;
  counters: Record<NumberSeries, Counter>;
  /** Transfers exist only with more than one branch. */
  showTransfers: boolean;
}) {
  const t = useT();
  const { onSubmit, pending, errors } = useFormAction(updateInvoiceFormat);
  const [prefixes, setPrefixes] = useState<Record<PrefixField, string>>({
    invoicePrefix: settings.invoicePrefix,
    taxInvoicePrefix: settings.taxInvoicePrefix,
    creditNotePrefix: settings.creditNotePrefix,
    purchasePrefix: settings.purchasePrefix,
    transferPrefix: settings.transferPrefix,
  });
  const [dateFormat, setDateFormat] = useState<InvoiceDateFormat>(settings.invoiceDateFormat);
  const [buddhist, setBuddhist] = useState(settings.invoiceBuddhistYear);
  const [digits, setDigits] = useState(String(settings.invoiceDigits));
  const [perBranch, setPerBranch] = useState(settings.numberPerBranch);
  // The server's answer for the settings on screen; it knows which numbers
  // were already issued. Until it arrives, a local guess is shown.
  const [checked, setChecked] = useState<{ key: string; numbers: Record<NumberSeries, string> } | null>(null);
  const request = useRef(0);

  const trimmed = Object.fromEntries(
    Object.entries(prefixes).map(([field, value]) => [field, value.trim()]),
  ) as Record<PrefixField, string>;
  const draft: Settings = {
    ...trimmed,
    invoiceDateFormat: dateFormat,
    invoiceBuddhistYear: buddhist,
    invoiceDigits: Math.min(MAX_INVOICE_DIGITS, Math.max(MIN_INVOICE_DIGITS, Number(digits) || 0)),
    numberPerBranch: perBranch,
  };
  const key = JSON.stringify(draft);

  const guess = (series: NumberSeries, field: PrefixField) => {
    const prefix = perBranch ? `${draft[field]}${branchCode}-` : draft[field];
    const format = { ...draft, invoicePrefix: prefix };
    const period = invoicePeriod(format, today);
    const counter = counters[series];
    const same = period === counter.period && prefix === counter.prefix;
    return formatInvoiceNumber(format, period, same ? counter.seq + 1 : 1);
  };
  const next = (series: NumberSeries, field: PrefixField) =>
    checked?.key === key ? checked.numbers[series] : guess(series, field);

  /** Why a prefix cannot be used, checked as it is typed. */
  const localError = (field: PrefixField): string | undefined => {
    if (!INVOICE_PREFIX_PATTERN.test(draft[field])) return t("settings.invoicePrefixInvalid");
    const index = SERIES.findIndex((s) => s.field === field);
    if (SERIES.slice(0, index).some((s) => draft[s.field] === draft[field])) return t("settings.prefixSame");
    return undefined;
  };
  const valid = SERIES.every(({ field }) => !localError(field));

  /** Asks the server for the real next numbers once typing pauses. */
  function check(changes: Partial<Settings>) {
    const target = { ...draft, ...changes };
    const id = ++request.current;
    window.setTimeout(async () => {
      if (id !== request.current) return;
      const numbers = await previewDocumentNumbers(target).catch(() => null);
      if (numbers && id === request.current) setChecked({ key: JSON.stringify(target), numbers });
    }, 300);
  }

  const shown = SERIES.filter((s) => showTransfers || s.series !== "transfer");

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {/* Kept when hidden, so saving never clears it. */}
      {!showTransfers && <input type="hidden" name="transferPrefix" value={prefixes.transferPrefix} />}
      <div className="grid gap-4 sm:grid-cols-2">
        {shown.map(({ field, label, hint }) => (
          <Field key={field} label={t(label)} htmlFor={field} error={errors[field] ?? localError(field)} hint={hint ? t(hint) : undefined}>
            <Input
              id={field}
              name={field}
              value={prefixes[field]}
              maxLength={MAX_INVOICE_PREFIX}
              autoComplete="off"
              onChange={(e) => {
                setPrefixes({ ...prefixes, [field]: e.target.value });
                check({ [field]: e.target.value.trim() });
              }}
            />
          </Field>
        ))}
        <Field label={t("settings.invoiceDateFormat")} htmlFor="invoiceDateFormat" error={errors.invoiceDateFormat}>
          <Select
            id="invoiceDateFormat"
            name="invoiceDateFormat"
            value={dateFormat}
            onChange={(e) => {
              setDateFormat(e.target.value as InvoiceDateFormat);
              check({ invoiceDateFormat: e.target.value as InvoiceDateFormat });
            }}
          >
            {INVOICE_DATE_FORMAT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "none" ? t("settings.invoiceNoDate") : option}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={t("settings.invoiceDigits")}
          htmlFor="invoiceDigits"
          error={errors.invoiceDigits}
          hint={t("settings.invoiceDigitsHint", { min: MIN_INVOICE_DIGITS, max: MAX_INVOICE_DIGITS })}
        >
          <Input
            id="invoiceDigits"
            name="invoiceDigits"
            type="number"
            inputMode="numeric"
            min={MIN_INVOICE_DIGITS}
            max={MAX_INVOICE_DIGITS}
            value={digits}
            required
            onChange={(e) => {
              setDigits(e.target.value);
              const n = Number(e.target.value);
              if (n >= MIN_INVOICE_DIGITS && n <= MAX_INVOICE_DIGITS) check({ invoiceDigits: n });
            }}
          />
        </Field>
      </div>
      {dateFormat !== "none" && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="invoiceBuddhistYear"
            checked={buddhist}
            onChange={(e) => {
              setBuddhist(e.target.checked);
              check({ invoiceBuddhistYear: e.target.checked });
            }}
            className="size-4 accent-primary"
          />
          {t("settings.invoiceBuddhistYear")}
        </label>
      )}
      <div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="numberPerBranch"
            checked={perBranch}
            onChange={(e) => {
              setPerBranch(e.target.checked);
              check({ numberPerBranch: e.target.checked });
            }}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span className="font-medium">{t("settings.numberPerBranch")}</span>
            <span className="block text-muted-foreground">{t("settings.numberPerBranchHint")}</span>
          </span>
        </label>
        {errors.numberPerBranch && <p className="mt-1 text-sm text-destructive">{errors.numberPerBranch}</p>}
      </div>
      <div className="rounded-lg bg-muted px-4 py-3 text-sm">
        {shown.map(({ series, field, next: label }) => (
          <p key={series} className="flex flex-wrap gap-x-2">
            <span className="text-muted-foreground">{t(label)}</span>
            <span className="font-mono font-semibold" data-testid={`${series}-preview`}>
              {next(series, field)}
            </span>
          </p>
        ))}
        <p className="mt-1 text-xs text-muted-foreground">
          {dateFormat === "none" ? t("settings.invoiceNeverResets") : t("settings.invoiceResets")}
        </p>
      </div>
      <div>
        <Button type="submit" disabled={pending || !valid}>
          {pending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
