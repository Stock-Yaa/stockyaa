"use client";

import {
  Check,
  CircleCheck,
  Database,
  Download,
  FileSpreadsheet,
  Globe,
  Inbox,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useFormat, usePharmacy } from "@/components/pharmacy-context";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/form";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import { parseCsv } from "@/lib/csv";
import { DRUG_CLASSES, type CatalogDrug, type DrugClassKey } from "@/lib/drug-catalog";
import { cn } from "@/lib/utils";
import { importProducts, lookupDrugs, searchDrugs } from "./actions";
import {
  CSV_COLUMNS,
  MAX_BULK_NAMES,
  MAX_IMPORT_ROWS,
  itemFromDrug,
  itemsFromCsv,
  type ImportItem,
} from "./import-item";

type Mode = "web" | "csv";
type Errors = Record<string, Record<string, string>>;

const CLASS_LABEL: Record<DrugClassKey, MessageKey> = {
  painRelief: "bulkImport.classPainRelief",
  antibiotics: "bulkImport.classAntibiotics",
  macrolides: "bulkImport.classMacrolides",
  antihistamines: "bulkImport.classAntihistamines",
  antacids: "bulkImport.classAntacids",
  diabetes: "bulkImport.classDiabetes",
  cholesterol: "bulkImport.classCholesterol",
  bloodPressure: "bulkImport.classBloodPressure",
  calciumChannel: "bulkImport.classCalciumChannel",
  steroids: "bulkImport.classSteroids",
  antidepressants: "bulkImport.classAntidepressants",
};

// Fields without an input on the queue card; their errors are listed by name.
const OTHER_FIELDS: Partial<Record<keyof ImportItem, MessageKey>> = {
  name: "common.name",
  genericName: "products.genericName",
  manufacturer: "products.manufacturer",
  dosageForm: "products.dosageForm",
  strength: "products.strength",
  barcode: "products.barcode",
  category: "products.category",
  reorderLevel: "products.reorderLevel",
};

/** Strength, form, generic name, maker and category on one line. */
function detailsOf(item: ImportItem): string {
  const generic = item.genericName !== item.name ? item.genericName : "";
  return [item.strength, item.dosageForm, generic, item.manufacturer, item.category]
    .filter(Boolean)
    .join(" · ");
}

/** Bulk import: build a queue from the drug catalogue or a CSV file, then import it. */
export function BulkImport() {
  const t = useT();
  // Opening stock goes into the branch this page was opened in.
  const { branch } = usePharmacy();
  const [mode, setMode] = useState<Mode>("web");
  const [queue, setQueue] = useState<ImportItem[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [importing, startImport] = useTransition();

  function addItems(items: ImportItem[]) {
    setImportedCount(null);
    setQueue((current) => {
      const keys = new Set(current.map((item) => item.key));
      const fresh = items.filter((item) => !keys.has(item.key));
      const room = MAX_IMPORT_ROWS - current.length;
      if (fresh.length > room) toast.error(t("bulkImport.queueFull", { max: MAX_IMPORT_ROWS }));
      return [...current, ...fresh.slice(0, Math.max(0, room))];
    });
  }

  function updateItem(key: string, field: keyof ImportItem, value: string | boolean) {
    setQueue((current) =>
      current.map((item) => (item.key === key ? { ...item, [field]: value } : item)),
    );
    setErrors((current) => {
      if (!current[key]?.[field]) return current;
      const fieldErrors = { ...current[key] };
      delete fieldErrors[field];
      return { ...current, [key]: fieldErrors };
    });
  }

  function removeItem(key: string) {
    setQueue((current) => current.filter((item) => item.key !== key));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function clearQueue() {
    setQueue([]);
    setErrors({});
  }

  function runImport() {
    startImport(async () => {
      const result = await importProducts(queue, branch.id);
      if (result.ok) {
        toast.success(result.message);
        setImportedCount(queue.length);
        clearQueue();
        return;
      }
      toast.error(result.message);
      const byKey: Errors = {};
      for (const [index, fieldErrors] of Object.entries(result.rowErrors ?? {})) {
        const item = queue[Number(index)];
        if (item) byKey[item.key] = fieldErrors;
      }
      setErrors(byKey);
    });
  }

  const queuedKeys = new Set(queue.map((item) => item.key));

  return (
    <>
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <ModeCard
          active={mode === "web"}
          onClick={() => setMode("web")}
          icon={Globe}
          title={t("bulkImport.modeWeb")}
          hint={t("bulkImport.modeWebHint")}
        />
        <ModeCard
          active={mode === "csv"}
          onClick={() => setMode("csv")}
          icon={FileSpreadsheet}
          title={t("bulkImport.modeCsv")}
          hint={t("bulkImport.modeCsvHint")}
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        {mode === "web" ? (
          <WebPanel queuedKeys={queuedKeys} onAdd={(drugs) => addItems(drugs.map(itemFromDrug))} />
        ) : (
          <CsvPanel onAdd={addItems} />
        )}

        <Card className="xl:sticky xl:top-20">
          <CardHeader className="items-start">
            <div className="min-w-0">
              <CardTitle>{t("bulkImport.queueTitle")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t("bulkImport.queueHint")}</p>
            </div>
            {queue.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearQueue} disabled={importing}>
                <Trash2 />
                {t("bulkImport.clearQueue")}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {queue.length === 0 ? (
              importedCount !== null ? (
                <Placeholder
                  icon={CircleCheck}
                  title={t("bulkImport.imported", { count: importedCount })}
                >
                  <Link href="/products" className={buttonClass({ variant: "outline", size: "sm" })}>
                    {t("bulkImport.viewProducts")}
                  </Link>
                </Placeholder>
              ) : (
                <Placeholder
                  icon={Inbox}
                  title={t("bulkImport.queueEmpty")}
                  hint={t("bulkImport.queueEmptyHint")}
                />
              )
            ) : (
              <>
                <ul className="-mx-1 max-h-[65vh] space-y-3 overflow-y-auto px-1">
                  {queue.map((item) => (
                    <QueueItem
                      key={item.key}
                      item={item}
                      errors={errors[item.key] ?? {}}
                      onChange={(field, value) => updateItem(item.key, field, value)}
                      onRemove={() => removeItem(item.key)}
                    />
                  ))}
                </ul>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">
                    {t("bulkImport.queueCount", { count: queue.length })}
                  </p>
                  <Button onClick={runImport} disabled={importing}>
                    <Upload />
                    {importing
                      ? t("bulkImport.importing")
                      : t("bulkImport.importButton", { count: queue.length })}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ModeCard({
  active,
  onClick,
  icon: Icon,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Globe;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border bg-card hover:bg-muted/50",
      )}
    >
      <p className="flex items-center gap-2 font-semibold">
        <Icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground")} />
        {title}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </button>
  );
}

/** Two or three mutually exclusive choices shown as a pill switch. */
function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg bg-muted p-1", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
            value === option.value
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Placeholder({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Globe;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <Icon className="mb-3 size-8 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

function WebPanel({
  queuedKeys,
  onAdd,
}: {
  queuedKeys: Set<string>;
  onAdd: (drugs: CatalogDrug[]) => void;
}) {
  const t = useT();
  const [view, setView] = useState<"pick" | "bulk">("pick");
  const [tab, setTab] = useState<"results" | "browse">("results");
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState<{
    query: string;
    results: CatalogDrug[];
    suggestion: string | null;
  } | null>(null);
  const [drugClass, setDrugClass] = useState<DrugClassKey | null>(null);
  const [classResults, setClassResults] = useState<CatalogDrug[] | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [bulkSummary, setBulkSummary] = useState<{
    added: number;
    notFound: string[];
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function search(text: string) {
    const q = text.trim();
    if (!q) return;
    setQuery(q);
    setTab("results");
    startTransition(async () => {
      const result = await searchDrugs(q, null);
      if (!result.ok) return void toast.error(result.message);
      setSearched({ query: q, results: result.results, suggestion: result.suggestion });
    });
  }

  function browse(key: DrugClassKey) {
    setDrugClass(key);
    setClassResults(null);
    startTransition(async () => {
      const result = await searchDrugs("", key);
      if (!result.ok) return void toast.error(result.message);
      setClassResults(result.results);
    });
  }

  function bulkAdd() {
    startTransition(async () => {
      const result = await lookupDrugs(bulkText);
      if (!result.ok) return void toast.error(result.message);
      onAdd(result.found);
      setBulkSummary({ added: result.found.length, notFound: result.notFound });
      // Keep only the names that were not found, so they can be corrected.
      setBulkText(result.notFound.join("\n"));
    });
  }

  return (
    <Card>
      <CardHeader className="flex-wrap items-start">
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            {t("bulkImport.modeWeb")}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{t("bulkImport.poweredBy")}</p>
        </div>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "pick", label: t("bulkImport.searchAndPick") },
            { value: "bulk", label: t("bulkImport.bulkAdd") },
          ]}
        />
      </CardHeader>
      <CardContent>
        {view === "pick" ? (
          <>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                search(query);
              }}
            >
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("bulkImport.searchPlaceholder")}
                  aria-label={t("bulkImport.search")}
                  className="pl-9"
                />
              </div>
              <Button type="submit" disabled={pending || !query.trim()}>
                {t("bulkImport.search")}
              </Button>
            </form>

            <Segmented
              className="mt-4 flex w-full"
              value={tab}
              onChange={setTab}
              options={[
                { value: "results", label: t("bulkImport.tabResults") },
                { value: "browse", label: t("bulkImport.tabBrowse") },
              ]}
            />

            <div className="mt-4">
              {tab === "results" ? (
                pending && !drugClass ? (
                  <Placeholder icon={Search} title={t("bulkImport.searching")} />
                ) : !searched ? (
                  <Placeholder icon={Search} title={t("bulkImport.typeToSearch")} />
                ) : searched.results.length === 0 ? (
                  <Placeholder
                    icon={Search}
                    title={t("bulkImport.noMatches", { query: searched.query })}
                  >
                    {searched.suggestion && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => search(searched.suggestion!)}
                      >
                        {t("bulkImport.didYouMean", { name: searched.suggestion })}
                      </Button>
                    )}
                  </Placeholder>
                ) : (
                  <DrugList drugs={searched.results} queuedKeys={queuedKeys} onAdd={onAdd} />
                )
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(DRUG_CLASSES) as DrugClassKey[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={drugClass === key}
                        onClick={() => browse(key)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-sm transition-colors",
                          drugClass === key
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card hover:bg-muted",
                        )}
                      >
                        {t(CLASS_LABEL[key])}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4">
                    {!drugClass ? (
                      <Placeholder icon={Database} title={t("bulkImport.chooseClass")} />
                    ) : pending || !classResults ? (
                      <Placeholder icon={Search} title={t("bulkImport.searching")} />
                    ) : (
                      <DrugList drugs={classResults} queuedKeys={queuedKeys} onAdd={onAdd} />
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Label htmlFor="bulk-names">{t("bulkImport.bulkHint", { max: MAX_BULK_NAMES })}</Label>
            <Textarea
              id="bulk-names"
              rows={8}
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              placeholder={t("bulkImport.bulkPlaceholder")}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              {bulkSummary ? (
                <div className="text-sm">
                  <p className="text-success">{t("bulkImport.bulkAdded", { count: bulkSummary.added })}</p>
                  {bulkSummary.notFound.length > 0 && (
                    <p className="text-destructive">
                      {t("bulkImport.bulkNotFound", { names: bulkSummary.notFound.join(", ") })}
                    </p>
                  )}
                </div>
              ) : (
                <span />
              )}
              <Button onClick={bulkAdd} disabled={pending || !bulkText.trim()}>
                <Plus />
                {pending ? t("bulkImport.searching") : t("bulkImport.findAndAdd")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DrugList({
  drugs,
  queuedKeys,
  onAdd,
}: {
  drugs: CatalogDrug[];
  queuedKeys: Set<string>;
  onAdd: (drugs: CatalogDrug[]) => void;
}) {
  const t = useT();
  const notQueued = drugs.filter((drug) => !queuedKeys.has(itemFromDrug(drug).key));
  return (
    <>
      <div className="mb-2 flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAdd(notQueued)}
          disabled={notQueued.length === 0}
        >
          <Plus />
          {t("bulkImport.addAll")}
        </Button>
      </div>
      <ul className="max-h-[55vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {drugs.map((drug) => {
          const item = itemFromDrug(drug);
          const queued = queuedKeys.has(item.key);
          return (
            <li key={drug.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {drug.name}
                  {drug.requiresPrescription && (
                    <Badge tone="warning" title={t("products.rxHint")}>
                      {t("products.rx")}
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{detailsOf(item)}</p>
                {drug.drugClass && <p className="mt-0.5 text-xs text-muted-foreground">{drug.drugClass}</p>}
              </div>
              <Button
                variant={queued ? "ghost" : "outline"}
                size="sm"
                onClick={() => onAdd([drug])}
                disabled={queued}
              >
                {queued ? <Check /> : <Plus />}
                {queued ? t("bulkImport.added") : t("bulkImport.add")}
              </Button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function CsvPanel({ onAdd }: { onAdd: (items: ImportItem[]) => void }) {
  const t = useT();
  const fileCount = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; lines: string[] } | null>(null);

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      return setNotice({ ok: false, lines: [t("bulkImport.csvNotCsv")] });
    }
    fileCount.current += 1;
    const { items, unknownColumns, hasName } = itemsFromCsv(
      parseCsv(await file.text()),
      `csv-${fileCount.current}`,
    );
    if (!hasName) return setNotice({ ok: false, lines: [t("bulkImport.csvNoName")] });
    if (items.length === 0) return setNotice({ ok: false, lines: [t("bulkImport.csvEmpty")] });

    const kept = items.slice(0, MAX_IMPORT_ROWS);
    onAdd(kept);
    setNotice({
      ok: true,
      lines: [
        t("bulkImport.csvLoaded", { count: kept.length, file: file.name }),
        ...(items.length > kept.length
          ? [t("bulkImport.csvTooMany", { max: MAX_IMPORT_ROWS })]
          : []),
        ...(unknownColumns.length > 0
          ? [t("bulkImport.csvUnknownColumns", { columns: unknownColumns.join(", ") })]
          : []),
      ],
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="size-4 text-primary" />
          {t("bulkImport.modeCsv")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Step number={1} title={t("bulkImport.csvStep1")} hint={t("bulkImport.csvStep1Hint")}>
          <a href="/inventory/import/template" download className={buttonClass({ variant: "outline", size: "sm" })}>
            <Download />
            {t("bulkImport.downloadTemplate")}
          </a>
          <p className="mt-3 text-xs text-muted-foreground">{t("bulkImport.csvColumns")}:</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.keys(CSV_COLUMNS).map((column) => (
              <code key={column} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                {column}
              </code>
            ))}
          </div>
        </Step>

        <Step number={2} title={t("bulkImport.csvStep2")} hint={t("bulkImport.csvStep2Hint")}>
          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void readFile(event.dataTransfer.files[0]);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center text-sm transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
            )}
          >
            <Upload className="mb-2 size-6 text-muted-foreground" />
            {t("bulkImport.dropFile")}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                void readFile(event.target.files?.[0]);
                // Let the same file be chosen again after it is edited.
                event.target.value = "";
              }}
            />
          </label>
          {notice && (
            <div
              className={cn(
                "mt-3 rounded-lg border px-3 py-2 text-sm",
                notice.ok
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-destructive/30 bg-destructive/10 text-destructive",
              )}
            >
              {notice.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}
        </Step>
      </CardContent>
    </Card>
  );
}

function Step({
  number,
  title,
  hint,
  children,
}: {
  number: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 mb-3 text-sm text-muted-foreground">{hint}</p>
        {children}
      </div>
    </div>
  );
}

function QueueItem({
  item,
  errors,
  onChange,
  onRemove,
}: {
  item: ImportItem;
  errors: Record<string, string>;
  onChange: (field: keyof ImportItem, value: string | boolean) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const f = useFormat();
  const id = (field: string) => `${item.key}-${field}`;
  const otherErrors = Object.entries(OTHER_FIELDS).flatMap(([field, label]) =>
    errors[field] ? [`${t(label)}: ${errors[field]}`] : [],
  );
  const hasStock = Number(item.openingQuantity) > 0;

  const input = (
    field: keyof ImportItem,
    label: string,
    props: React.ComponentProps<"input"> = {},
  ) => (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id(field)} className="text-xs">
        {label}
      </Label>
      <Input
        id={id(field)}
        value={String(item[field])}
        onChange={(event) => onChange(field, event.target.value)}
        aria-invalid={errors[field] ? true : undefined}
        className={cn("h-9", errors[field] && "border-destructive")}
        {...props}
      />
      {errors[field] && <p className="text-xs text-destructive">{errors[field]}</p>}
    </div>
  );

  return (
    <li
      className={cn(
        "rounded-lg border p-3",
        Object.keys(errors).length > 0 ? "border-destructive/50 bg-destructive/5" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {item.name || "—"}
            {item.requiresPrescription && <Badge tone="warning">{t("products.rx")}</Badge>}
          </p>
          {detailsOf(item) && (
            <p className="mt-0.5 text-xs text-muted-foreground">{detailsOf(item)}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onRemove}
          aria-label={t("bulkImport.remove")}
          title={t("bulkImport.remove")}
        >
          <X />
        </Button>
      </div>

      {otherErrors.length > 0 && (
        <ul className="mt-2 text-xs text-destructive">
          {otherErrors.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {input("salePrice", t("products.salePriceWithCurrency", { currency: f.currency }), {
          inputMode: "decimal",
          required: true,
        })}
        {input("costPrice", t("products.costPriceWithCurrency", { currency: f.currency }), {
          inputMode: "decimal",
        })}
        {input("unit", t("products.unit"))}
        {input("openingQuantity", t("products.openingQuantity"), { inputMode: "numeric" })}
        {hasStock && (
          <>
            <div className="col-span-1 sm:col-span-2">
              {input("openingBatchNumber", t("products.batchNumber"))}
            </div>
            <div className="col-span-1 sm:col-span-2">
              {input("openingExpiryDate", t("products.expiryDate"), { type: "date" })}
            </div>
          </>
        )}
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={item.requiresPrescription}
          onChange={(event) => onChange("requiresPrescription", event.target.checked)}
          className="size-4 accent-primary"
        />
        {t("products.requiresPrescription")}
      </label>
    </li>
  );
}
