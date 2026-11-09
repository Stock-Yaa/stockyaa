"use client";

import { useState } from "react";
import { useFormat, usePharmacy } from "@/components/pharmacy-context";
import { Field, Input } from "@/components/ui/form";
import type { Product } from "@/db/schema";
import { useT } from "@/i18n/client";
import { percentOff } from "@/lib/pricing";
import { cn, round2 } from "@/lib/utils";

type Mode = "amount" | "percent";
type Level = "member" | "staff";

const FIELDS = {
  member: { price: "memberPrice", percent: "memberDiscount", label: "products.memberPrice" },
  staff: { price: "staffPrice", percent: "staffDiscount", label: "products.staffPrice" },
} as const;

const toNumber = (value: string) => {
  const n = Number(value);
  return value.trim() === "" || !Number.isFinite(n) ? null : n;
};

/**
 * The regular price plus the member and staff prices. Each of those is either
 * a fixed price or a percent off the regular price, and shows the price it
 * comes to as the user types.
 */
export function PriceFields({
  product,
  errors,
}: {
  product?: Product;
  errors: Record<string, string | undefined>;
}) {
  const t = useT();
  const { currency } = usePharmacy();
  const [regular, setRegular] = useState(product ? String(product.salePrice) : "");

  return (
    <>
      <Field
        label={t("products.salePriceWithCurrency", { currency })}
        htmlFor="salePrice"
        error={errors.salePrice}
        required
      >
        <Input
          id="salePrice"
          name="salePrice"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={regular}
          onChange={(e) => setRegular(e.target.value)}
          required
        />
      </Field>
      <LevelPriceField level="member" product={product} regular={toNumber(regular)} errors={errors} />
      <LevelPriceField level="staff" product={product} regular={toNumber(regular)} errors={errors} />
    </>
  );
}

function LevelPriceField({
  level,
  product,
  regular,
  errors,
}: {
  level: Level;
  product?: Product;
  regular: number | null;
  errors: Record<string, string | undefined>;
}) {
  const t = useT();
  const f = useFormat();
  const { currency, priceRules } = usePharmacy();
  const field = FIELDS[level];
  const savedPercent = product?.[field.percent] ?? null;
  const savedPrice = product?.[field.price] ?? null;
  const [mode, setMode] = useState<Mode>(savedPercent !== null ? "percent" : "amount");
  const [value, setValue] = useState(
    savedPercent !== null ? String(savedPercent) : savedPrice !== null ? String(savedPrice) : "",
  );
  const entered = toNumber(value);
  const rule = level === "member" ? priceRules.memberDiscount : priceRules.staffDiscount;

  // Switching keeps the same price where it can: 71.25 of 75 becomes 5%.
  function switchTo(next: Mode) {
    if (next === mode) return;
    if (entered !== null && regular) {
      const converted =
        next === "percent"
          ? Math.min(100, Math.max(0, round2((1 - entered / regular) * 100)))
          : percentOff(regular, entered);
      setValue(String(converted));
    } else {
      setValue("");
    }
    setMode(next);
  }

  let summary: string | undefined;
  if (regular !== null) {
    if (entered === null) {
      summary = rule
        ? t("products.levelPriceRule", { percent: f.number(rule), price: f.money(percentOff(regular, rule)) })
        : t("products.levelPriceRegular", { price: f.money(regular) });
    } else if (mode === "percent") {
      summary = t("products.levelPriceSellsAt", { price: f.money(percentOff(regular, entered)) });
    } else if (regular > 0 && entered < regular) {
      summary = t("products.levelPricePercentOff", { percent: f.number(round2((1 - entered / regular) * 100)) });
    }
  }

  const inputId = level === "member" ? "memberPrice" : "staffPrice";
  return (
    <Field
      label={t(field.label)}
      htmlFor={inputId}
      error={errors[field.price] ?? errors[field.percent]}
      hint={summary}
    >
      <div className="flex gap-2">
        <Input
          id={inputId}
          // Only the chosen kind is sent; the server clears the other.
          name={mode === "percent" ? field.percent : field.price}
          type="number"
          inputMode="decimal"
          min={0}
          max={mode === "percent" ? 100 : undefined}
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={mode === "percent" ? "0" : "0.00"}
          className="min-w-0 flex-1"
        />
        <div
          role="group"
          aria-label={t("products.levelPriceMode")}
          className="flex shrink-0 items-center rounded-lg border border-border bg-muted p-0.5 text-xs font-medium"
        >
          {(["amount", "percent"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchTo(m)}
              aria-pressed={mode === m}
              title={t(m === "amount" ? "products.levelPriceModeAmount" : "products.levelPriceModePercent")}
              className={cn(
                "h-full rounded-md px-2.5 transition-colors",
                mode === m
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "amount" ? currency : "%"}
            </button>
          ))}
        </div>
      </div>
    </Field>
  );
}
