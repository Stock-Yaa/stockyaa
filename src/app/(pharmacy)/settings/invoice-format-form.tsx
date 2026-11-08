"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
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
import { previewDocumentNumbers, updateInvoiceFormat } from "./actions";

type Settings = {
  invoicePrefix: string;
  taxInvoicePrefix: string;
  invoiceDateFormat: InvoiceDateFormat;
  invoiceBuddhistYear: boolean;
  invoiceDigits: number;
};

type Counter = { seq: number; period: string; prefix: string };

/**
 * Prefixes (sales and tax receipts), date part and digits of new document
 * numbers, with a live preview of the next ones. `today` is the pharmacy's
 * calendar day; `counters` are where each counter is now.
 */
export function InvoiceFormatForm({
  settings,
  today,
  counters,
}: {
  settings: Settings;
  today: string;
  counters: { sale: Counter; tax: Counter };
}) {
  const t = useT();
  const { onSubmit, pending, errors } = useFormAction(updateInvoiceFormat);
  const [prefix, setPrefix] = useState(settings.invoicePrefix);
  const [taxPrefix, setTaxPrefix] = useState(settings.taxInvoicePrefix);
  const [dateFormat, setDateFormat] = useState<InvoiceDateFormat>(settings.invoiceDateFormat);
  const [buddhist, setBuddhist] = useState(settings.invoiceBuddhistYear);
  const [digits, setDigits] = useState(String(settings.invoiceDigits));
  // The server's answer for the settings on screen; it knows which numbers
  // were already issued. Until it arrives, a local guess is shown.
  const [checked, setChecked] = useState<{ key: string; sale: string; tax: string } | null>(null);
  const request = useRef(0);

  const draft: Settings = {
    invoicePrefix: prefix.trim(),
    taxInvoicePrefix: taxPrefix.trim(),
    invoiceDateFormat: dateFormat,
    invoiceBuddhistYear: buddhist,
    invoiceDigits: Math.min(MAX_INVOICE_DIGITS, Math.max(MIN_INVOICE_DIGITS, Number(digits) || 0)),
  };
  const key = JSON.stringify(draft);
  const guess = (seriesPrefix: string, counter: Counter) => {
    const format = { ...draft, invoicePrefix: seriesPrefix };
    const period = invoicePeriod(format, today);
    const same = period === counter.period && seriesPrefix === counter.prefix;
    return formatInvoiceNumber(format, period, same ? counter.seq + 1 : 1);
  };
  const next = {
    sale: checked?.key === key ? checked.sale : guess(draft.invoicePrefix, counters.sale),
    tax: checked?.key === key ? checked.tax : guess(draft.taxInvoicePrefix, counters.tax),
  };
  const validPrefix = INVOICE_PREFIX_PATTERN.test(draft.invoicePrefix);
  const validTaxPrefix =
    INVOICE_PREFIX_PATTERN.test(draft.taxInvoicePrefix) && draft.taxInvoicePrefix !== draft.invoicePrefix;

  /** Asks the server for the real next numbers once typing pauses. */
  function check(changes: Partial<Settings>) {
    const target = { ...draft, ...changes };
    const id = ++request.current;
    window.setTimeout(async () => {
      if (id !== request.current) return;
      const numbers = await previewDocumentNumbers(target).catch(() => null);
      if (numbers && id === request.current) setChecked({ key: JSON.stringify(target), ...numbers });
    }, 300);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("settings.invoicePrefix")}
          htmlFor="invoicePrefix"
          error={errors.invoicePrefix ?? (validPrefix ? undefined : t("settings.invoicePrefixInvalid"))}
          hint={t("settings.invoicePrefixHint")}
        >
          <Input
            id="invoicePrefix"
            name="invoicePrefix"
            value={prefix}
            maxLength={MAX_INVOICE_PREFIX}
            autoComplete="off"
            onChange={(e) => {
              setPrefix(e.target.value);
              check({ invoicePrefix: e.target.value.trim() });
            }}
          />
        </Field>
        <Field
          label={t("settings.taxInvoicePrefix")}
          htmlFor="taxInvoicePrefix"
          error={
            errors.taxInvoicePrefix ??
            (validTaxPrefix
              ? undefined
              : t(draft.taxInvoicePrefix === draft.invoicePrefix ? "settings.taxPrefixSame" : "settings.invoicePrefixInvalid"))
          }
          hint={t("settings.taxInvoicePrefixHint")}
        >
          <Input
            id="taxInvoicePrefix"
            name="taxInvoicePrefix"
            value={taxPrefix}
            maxLength={MAX_INVOICE_PREFIX}
            autoComplete="off"
            onChange={(e) => {
              setTaxPrefix(e.target.value);
              check({ taxInvoicePrefix: e.target.value.trim() });
            }}
          />
        </Field>
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
      <div className="rounded-lg bg-muted px-4 py-3 text-sm">
        <p>
          <span className="text-muted-foreground">{t("settings.invoiceNext")}</span>{" "}
          <span className="font-mono text-base font-semibold" data-testid="invoice-preview">
            {next.sale}
          </span>
        </p>
        <p className="mt-1">
          <span className="text-muted-foreground">{t("settings.taxInvoiceNext")}</span>{" "}
          <span className="font-mono text-base font-semibold" data-testid="tax-preview">
            {next.tax}
          </span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {dateFormat === "none" ? t("settings.invoiceNeverResets") : t("settings.invoiceResets")}
        </p>
      </div>
      <div>
        <Button type="submit" disabled={pending || !validPrefix || !validTaxPrefix}>
          {pending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
