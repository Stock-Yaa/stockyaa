"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/i18n/actions";
import { useLocale, useT } from "@/i18n/client";
import { LOCALES, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

const SHORT: Record<Locale, string> = { en: "EN", th: "ไทย" };

/** EN / ไทย switch. The choice is stored in a cookie and applies to every page. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: Locale) {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={t("common.language")}
      className={cn(
        "flex items-center rounded-lg border border-border bg-muted p-0.5 text-xs font-medium",
        pending && "opacity-60",
        className,
      )}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => change(l)}
          aria-pressed={l === locale}
          className={cn(
            "rounded-md px-2 py-1 transition-colors",
            l === locale
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {SHORT[l]}
        </button>
      ))}
    </div>
  );
}
