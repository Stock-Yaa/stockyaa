"use client";

import { Search, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { useT } from "@/i18n/client";
import type { TmtSearchResult } from "@/lib/drug-database";
import { searchTmt } from "./actions";

/** Product fields filled from TMT when they are still empty. */
const FILL: { field: string; from: (r: TmtSearchResult) => string | null }[] = [
  { field: "manufacturer", from: (r) => r.manufacturer },
  { field: "strength", from: (r) => r.strength },
  { field: "dosageForm", from: (r) => r.dosageForm },
  { field: "genericName", from: (r) => r.activeIngredient },
];

/**
 * Links a product to its TMT trade product (TPU code), which the dispensing
 * label starts from. Picking one fills the product's empty details from TMT;
 * anything already typed is kept.
 */
export function TmtPicker({ initial, error }: { initial: TmtSearchResult | null; error?: string }) {
  const t = useT();
  const [selected, setSelected] = useState<TmtSearchResult | null>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TmtSearchResult[] | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef("");
  const wrapper = useRef<HTMLDivElement>(null);

  function search(value: string) {
    setQuery(value);
    latest.current = value;
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setResults(null);
      return;
    }
    timer.current = setTimeout(() => {
      startTransition(async () => {
        const found = await searchTmt(value);
        // A slower answer to an older query must not replace a newer one.
        if (latest.current === value) setResults(found);
      });
    }, 300);
  }

  function pick(result: TmtSearchResult) {
    setSelected(result);
    setQuery("");
    setResults(null);
    const form = wrapper.current?.closest("form");
    for (const { field, from } of FILL) {
      const input = form?.elements.namedItem(field);
      const value = from(result);
      if (input instanceof HTMLInputElement && !input.value.trim() && value) input.value = value;
    }
  }

  return (
    <div ref={wrapper} className="sm:col-span-2">
      <Field label={t("products.tmtProduct")} htmlFor="tmt-search" error={error} hint={t("products.tmtHint")}>
        <input type="hidden" name="tpuId" value={selected?.tpuId ?? ""} />
        {selected ? (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="font-medium">
                {selected.tradeName}
                {selected.manufacturer && (
                  <span className="font-normal text-muted-foreground"> · {selected.manufacturer}</span>
                )}
              </p>
              {selected.gpuId > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selected.gpuName ?? `GPU ${selected.gpuId}`} · TPU {selected.tpuId}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("products.tmtRemove")}
              title={t("products.tmtRemove")}
              onClick={() => setSelected(null)}
            >
              <X />
            </Button>
          </div>
        ) : (
          <div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="tmt-search"
                type="search"
                value={query}
                onChange={(e) => search(e.target.value)}
                // Enter would submit the product form.
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
                placeholder={t("products.tmtSearchPlaceholder")}
                autoComplete="off"
                className="pl-9"
              />
            </div>
            {query.trim().length >= 2 && (
              <div className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-card shadow-sm">
                {pending && results === null ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">{t("products.tmtSearching")}</p>
                ) : results && results.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">{t("products.tmtNoResults")}</p>
                ) : (
                  <ul>
                    {results?.map((r) => (
                      <li key={r.tpuId}>
                        <button
                          type="button"
                          onClick={() => pick(r)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                        >
                          <span className="font-medium">{r.tradeName}</span>
                          {r.manufacturer && <span className="text-muted-foreground"> · {r.manufacturer}</span>}
                          <span className="block text-xs text-muted-foreground">
                            {r.gpuName ?? `GPU ${r.gpuId}`} · TPU {r.tpuId}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </Field>
    </div>
  );
}
