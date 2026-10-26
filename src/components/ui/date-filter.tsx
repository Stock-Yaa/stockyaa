"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { MAX_DAY, MIN_DAY } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Input } from "./form";

/**
 * Date input bound to a URL query parameter (YYYY-MM-DD); clearing it removes
 * the parameter. Like SearchInput, it updates the URL after a short pause and
 * resets `page`. `fallback` is the day shown while the parameter is absent
 * (the day the server page uses by default).
 */
export function DateFilter({
  param,
  label,
  min,
  max,
  fallback,
  className,
}: {
  param: string;
  label: string;
  min?: string;
  max?: string;
  fallback?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onChange(value: string) {
    if (timer.current) clearTimeout(timer.current);
    // While a year is being typed the browser reports dates like 0002-01-01.
    if (value && (value < MIN_DAY || value > MAX_DAY)) return;
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(param, value);
      else params.delete(param);
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`);
    }, 300);
  }

  return (
    <label className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <span className="whitespace-nowrap">{label}</span>
      <Input
        type="date"
        defaultValue={searchParams.get(param) ?? fallback ?? ""}
        min={min ?? MIN_DAY}
        max={max ?? MAX_DAY}
        onChange={(e) => onChange(e.target.value)}
        className="w-auto"
      />
    </label>
  );
}
