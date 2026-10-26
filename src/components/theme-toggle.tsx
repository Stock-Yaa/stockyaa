"use client";

import { Moon, Sun } from "lucide-react";
import { useT } from "@/i18n/client";
import { THEME_COOKIE } from "@/lib/theme";

/**
 * Switches between light and dark. The choice is kept in a cookie so the
 * server renders the right theme on the next request (no flash on load).
 */
export function ThemeToggle() {
  const t = useT();

  function toggle() {
    const root = document.documentElement;
    const isDark =
      root.classList.contains("dark") ||
      (!root.classList.contains("light") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";
    root.classList.remove("light", "dark");
    root.classList.add(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("common.theme")}
      title={t("common.theme")}
      className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Moon className="size-5 dark:hidden" />
      <Sun className="hidden size-5 dark:block" />
    </button>
  );
}
