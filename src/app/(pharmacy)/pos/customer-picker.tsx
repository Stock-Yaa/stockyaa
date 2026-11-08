"use client";

import { Search, UserPlus, UserRound, X } from "lucide-react";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import type { PriceLevel } from "@/db/schema";
import { useT } from "@/i18n/client";
import { PRICE_LEVEL_TONE } from "@/lib/price-labels";
import { cn } from "@/lib/utils";

export type PosCustomer = {
  id: string;
  name: string;
  phone: string | null;
  priceLevel: PriceLevel;
  /** Saved details for a full tax receipt. */
  taxId: string | null;
  taxBranch: string | null;
  address: string | null;
};

const MAX_MATCHES = 8;

const PRICE_LEVEL_PRICE = {
  regular: "pos.priceRegular",
  member: "pos.priceMember",
  staff: "pos.priceStaff",
} as const;

type Option = { kind: "customer"; customer: PosCustomer } | { kind: "create"; name: string };

/**
 * Customer for the sale: search by name or phone, or type a new name and add
 * it on the spot. Nothing selected means a walk-in customer.
 */
export function CustomerPicker({
  customers,
  selected,
  onSelect,
  onCreate,
  disabled,
}: {
  customers: PosCustomer[];
  selected: PosCustomer | null;
  onSelect: (customer: PosCustomer | null) => void;
  /** Adds a customer with this name; resolves once it is selected. */
  onCreate: (name: string) => Promise<void>;
  disabled?: boolean;
}) {
  const t = useT();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);

  const name = query.trim();
  const term = name.toLowerCase();
  const matches = term
    ? customers
        .filter(
          (c) => c.name.toLowerCase().includes(term) || (c.phone?.includes(term) ?? false),
        )
        .slice(0, MAX_MATCHES)
    : customers.slice(0, MAX_MATCHES);
  const exists = customers.some((c) => c.name.toLowerCase() === term);
  const options: Option[] = [
    ...matches.map((customer) => ({ kind: "customer" as const, customer })),
    ...(name && !exists ? [{ kind: "create" as const, name }] : []),
  ];
  const activeIndex = Math.min(active, options.length - 1);

  async function choose(option: Option) {
    setOpen(false);
    if (option.kind === "customer") {
      onSelect(option.customer);
      setQuery("");
      return;
    }
    setCreating(true);
    try {
      await onCreate(option.name);
      setQuery("");
    } finally {
      setCreating(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + options.length) % Math.max(options.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = options[activeIndex];
      if (open && option) void choose(option);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  if (selected) {
    return (
      <div className="flex h-10 items-center gap-2 rounded-lg border border-primary/40 bg-accent px-3 text-sm text-accent-foreground">
        <UserRound className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {selected.name}
          {selected.phone && <span className="ml-1.5 font-normal opacity-75">{selected.phone}</span>}
        </span>
        {selected.priceLevel !== "regular" && (
          <Badge tone={PRICE_LEVEL_TONE[selected.priceLevel]}>{t(PRICE_LEVEL_PRICE[selected.priceLevel])}</Badge>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelect(null)}
          aria-label={t("pos.removeCustomer")}
          title={t("pos.removeCustomer")}
          className="-mr-1 rounded-md p-1 hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options.length > 0 ? `${listId}-${activeIndex}` : undefined}
        aria-label={t("sales.customer")}
        autoComplete="off"
        disabled={disabled || creating}
        value={query}
        placeholder={creating ? t("pos.addingCustomer") : t("pos.customerPlaceholder")}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="pl-9"
      />
      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl"
        >
          {options.map((option, index) => (
            <li
              key={option.kind === "customer" ? option.customer.id : "create"}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              // Keeps focus in the input so the blur does not close the list first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void choose(option)}
              onMouseEnter={() => setActive(index)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm",
                index === activeIndex && "bg-muted",
              )}
            >
              {option.kind === "customer" ? (
                <>
                  <UserRound className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{option.customer.name}</span>
                  {option.customer.priceLevel !== "regular" && (
                    <Badge tone={PRICE_LEVEL_TONE[option.customer.priceLevel]}>
                      {t(PRICE_LEVEL_PRICE[option.customer.priceLevel])}
                    </Badge>
                  )}
                  {option.customer.phone && (
                    <span className="text-xs text-muted-foreground">{option.customer.phone}</span>
                  )}
                </>
              ) : (
                <>
                  <UserPlus className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate font-medium text-primary">
                    {t("pos.createCustomer", { name: option.name })}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
