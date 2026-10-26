"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { buttonClass } from "./button";
import { Input, Select } from "./form";

/**
 * Search box bound to a URL query parameter (default `q`). Typing updates the
 * URL after a short pause and resets `page`; the server page reads the value
 * from `searchParams`.
 */
export function SearchInput({
  param = "q",
  placeholder,
  className,
}: {
  param?: string;
  placeholder?: string;
  className?: string;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onChange(value: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) params.set(param, value.trim());
      else params.delete(param);
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`);
    }, 300);
  }

  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        defaultValue={searchParams.get(param) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t("common.searchPlaceholder")}
        className="pl-9"
      />
    </div>
  );
}

/** <select> bound to a URL query parameter; an empty value removes it. */
export function FilterSelect({
  param,
  options,
  className,
  "aria-label": ariaLabel,
}: {
  param: string;
  options: { value: string; label: string }[];
  className?: string;
  "aria-label"?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Select
      aria-label={ariaLabel}
      className={cn("w-auto min-w-40", className)}
      value={searchParams.get(param) ?? ""}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.value) params.set(param, e.target.value);
        else params.delete(param);
        params.delete("page");
        router.replace(`${pathname}?${params.toString()}`);
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

/** Previous/next links that keep the other query parameters. */
export function Pagination({ page, pageCount }: { page: number; pageCount: number }) {
  const t = useT();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (pageCount <= 1) return null;

  const href = (target: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (target <= 1) params.delete("page");
    else params.set("page", String(target));
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };
  const disabled = "pointer-events-none opacity-50";

  return (
    <nav className="mt-4 flex items-center justify-between gap-3 print:hidden">
      <p className="text-sm text-muted-foreground">
        {t("common.pageOf", { page, pages: pageCount })}
      </p>
      <div className="flex gap-2">
        <Link
          href={href(page - 1)}
          aria-disabled={page <= 1}
          className={buttonClass({
            variant: "outline",
            size: "sm",
            className: page <= 1 ? disabled : undefined,
          })}
        >
          <ChevronLeft />
          {t("common.previous")}
        </Link>
        <Link
          href={href(page + 1)}
          aria-disabled={page >= pageCount}
          className={buttonClass({
            variant: "outline",
            size: "sm",
            className: page >= pageCount ? disabled : undefined,
          })}
        >
          {t("common.next")}
          <ChevronRight />
        </Link>
      </div>
    </nav>
  );
}
