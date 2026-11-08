"use client";

import { Delete, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { useFormat, usePharmacy } from "@/components/pharmacy-context";
import { Field, Input, Select } from "@/components/ui/form";
import { useT } from "@/i18n/client";
import { MAX_PIECES, countsTotal, denominationsFor } from "@/lib/cash-counts";
import { cn, round2 } from "@/lib/utils";

/**
 * Counting cash: one stepper per note and coin of the pharmacy's currency,
 * with a running total. Sends the pieces as JSON in "counts" (or, for a
 * currency without notes and coins listed, the typed total in "amount").
 * Unmount it (close its dialog) to start a fresh count.
 */
export function CashCounter({
  notesOnly = false,
  totalLabel,
  error,
  onTotal,
}: {
  notesOnly?: boolean;
  totalLabel: string;
  error?: string;
  onTotal?: (total: number) => void;
}) {
  const t = useT();
  const f = useFormat();
  const { currency } = usePharmacy();
  const all = denominationsFor(currency);
  const denominations = all?.filter((d) => !notesOnly || d.kind === "note") ?? null;
  const [pieces, setPieces] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState("");

  if (!denominations) {
    return (
      <Field label={totalLabel} htmlFor="cash-amount" error={error} required>
        <Input
          id="cash-amount"
          name="amount"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            const value = Number(e.target.value);
            onTotal?.(Number.isFinite(value) && value > 0 ? round2(value) : 0);
          }}
          placeholder="0.00"
          required
          className="h-12 text-right text-lg tabular-nums"
        />
      </Field>
    );
  }

  const counts = Object.fromEntries(
    Object.entries(pieces)
      .map(([value, raw]) => [value, Number(raw)] as const)
      .filter(([, n]) => Number.isInteger(n) && n > 0),
  );
  const total = countsTotal(counts);

  function set(value: number, next: string) {
    const cleaned = next.replace(/\D/g, "").slice(0, String(MAX_PIECES).length);
    const updated = { ...pieces, [String(value)]: cleaned };
    setPieces(updated);
    const numbers = Object.fromEntries(
      Object.entries(updated)
        .map(([k, raw]) => [k, Number(raw)] as const)
        .filter(([, n]) => Number.isInteger(n) && n > 0),
    );
    onTotal?.(countsTotal(numbers));
  }

  return (
    <div>
      <input type="hidden" name="counts" value={JSON.stringify(counts)} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {denominations.map((d) => {
          const key = String(d.value);
          const count = Number(pieces[key] || 0);
          return (
            <div key={key} className="rounded-lg border border-border bg-card p-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-semibold tabular-nums">{f.number(d.value)}</span>
                <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  {t(d.kind === "note" ? "cashDrawer.note" : "cashDrawer.coin")}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => set(d.value, String(Math.max(0, count - 1)))}
                  aria-label={t("cashDrawer.fewer", { value: f.number(d.value) })}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-foreground hover:bg-muted/70"
                >
                  <Minus className="size-4" />
                </button>
                <Input
                  inputMode="numeric"
                  value={pieces[key] ?? ""}
                  placeholder="0"
                  onChange={(e) => set(d.value, e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label={t("cashDrawer.piecesOf", { value: f.number(d.value) })}
                  className="h-9 min-w-0 px-1 text-center text-base font-semibold tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => set(d.value, String(count + 1))}
                  aria-label={t("cashDrawer.more", { value: f.number(d.value) })}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-foreground hover:bg-muted/70"
                >
                  <Plus className="size-4" />
                </button>
              </div>
              <p className="mt-1.5 text-right text-xs text-muted-foreground tabular-nums">
                = {f.number(round2(count * d.value))}
              </p>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg bg-accent px-4 py-3 text-accent-foreground">
        <span className="font-medium">{totalLabel}</span>
        <span className="text-xl font-semibold tabular-nums">{f.money(total)}</span>
      </div>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** A PIN typed on the keyboard or tapped on the keypad; sent as `name`. */
export function PinInput({
  name = "pin",
  id = "pin",
  label,
  error,
}: {
  name?: string;
  id?: string;
  label: string;
  error?: string;
}) {
  const t = useT();
  const [pin, setPin] = useState("");
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

  return (
    <Field label={label} htmlFor={id} error={error} required>
      <Input
        id={id}
        name={name}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="h-12 text-center text-2xl tracking-[0.5em]"
        required
      />
      <div className="mx-auto mt-1 grid w-full max-w-64 grid-cols-3 gap-2">
        {keys.map((key, i) =>
          key === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() =>
                setPin((current) => (key === "back" ? current.slice(0, -1) : (current + key).slice(0, 6)))
              }
              aria-label={key === "back" ? t("cashDrawer.pinBackspace") : key}
              className={cn(
                "flex h-12 items-center justify-center rounded-lg border border-border bg-card text-xl font-medium",
                "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              )}
            >
              {key === "back" ? <Delete className="size-5" /> : key}
            </button>
          ),
        )}
      </div>
    </Field>
  );
}

export type StaffOption = { id: string; name: string; hasPin: boolean };

/** Who is at the drawer: people without a PIN are listed but cannot be picked. */
export function StaffSelect({
  staff,
  defaultValue,
  label,
  error,
  name = "userId",
  id = "staff",
}: {
  staff: StaffOption[];
  defaultValue?: string;
  label: string;
  error?: string;
  name?: string;
  id?: string;
}) {
  const t = useT();
  const first = staff.find((s) => s.id === defaultValue && s.hasPin) ?? staff.find((s) => s.hasPin);
  return (
    <Field label={label} htmlFor={id} error={error} required>
      <Select id={id} name={name} defaultValue={first?.id ?? ""} required>
        <option value="" disabled>
          {t("cashDrawer.chooseStaff")}
        </option>
        {staff.map((s) => (
          <option key={s.id} value={s.id} disabled={!s.hasPin}>
            {s.hasPin ? s.name : t("cashDrawer.noPinOption", { name: s.name })}
          </option>
        ))}
      </Select>
    </Field>
  );
}
