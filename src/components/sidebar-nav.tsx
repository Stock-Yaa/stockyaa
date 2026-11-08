"use client";

import { ChevronDown, Search, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";

export type NavLink = {
  href: string;
  label: MessageKey;
  icon: LucideIcon;
  /** Shown to pharmacy admins only. */
  adminOnly?: boolean;
  /** Hidden for a pharmacy that runs a single branch on a Standard plan. */
  multiBranchOnly?: boolean;
};
export type NavGroup = { label: MessageKey; icon: LucideIcon; items: NavLink[] };
export type NavEntry = NavLink | NavGroup;

const isGroup = (entry: NavEntry): entry is NavGroup => "items" in entry;

const noSubscribe = () => () => {};
/** Apple keyboards show ⌘ for the shortcut; everyone else uses Ctrl. Server render assumes Ctrl. */
function useIsMac() {
  return useSyncExternalStore(
    noSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );
}

/**
 * The link for the current page: the longest href that is the path or a parent
 * of it, so /inventory/alerts selects "Stock alerts" rather than "Stock" while
 * /customers/123 still selects "Customer list".
 */
function activeHref(entries: NavEntry[], pathname: string): string | undefined {
  return entries
    .flatMap((entry) => (isGroup(entry) ? entry.items : [entry]))
    .map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

/**
 * Sidebar navigation: single links and collapsible groups, with a search box
 * (Ctrl/⌘ K) that filters the menu and opens the first match on Enter.
 */
export function SidebarNav({
  entries,
  onNavigate,
  shortcut,
}: {
  entries: NavEntry[];
  onNavigate?: () => void;
  /** Listen for Ctrl/⌘ K; only one visible sidebar should. */
  shortcut?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const isMac = useIsMac();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  // Groups the user folded away; every group starts open.
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!shortcut) return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcut]);

  const current = activeHref(entries, pathname);
  const term = query.trim().toLowerCase();
  const matches = (label: MessageKey) => t(label).toLowerCase().includes(term);
  // While searching, a group shows the items that match, or all of them when its own name matches.
  const visible: NavEntry[] = term
    ? entries.flatMap((entry): NavEntry[] => {
        if (!isGroup(entry)) return matches(entry.label) ? [entry] : [];
        const items = matches(entry.label) ? entry.items : entry.items.filter((i) => matches(i.label));
        return items.length > 0 ? [{ ...entry, items }] : [];
      })
    : entries;
  const firstMatch = visible.flatMap((entry) => (isGroup(entry) ? entry.items : [entry]))[0];

  function navigate() {
    setQuery("");
    onNavigate?.();
  }

  function toggle(label: string) {
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setQuery("");
      event.currentTarget.blur();
    } else if (event.key === "Enter" && firstMatch && !event.nativeEvent.isComposing) {
      event.preventDefault();
      router.push(firstMatch.href);
      event.currentTarget.blur();
      navigate();
    }
  }

  const linkClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      active
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder={t("nav.search")}
            aria-label={t("nav.searchLabel")}
            aria-keyshortcuts={shortcut ? (isMac ? "Meta+K" : "Control+K") : undefined}
            autoComplete="off"
            className="h-9 w-full rounded-lg border border-border bg-background pr-14 pl-9 text-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {shortcut && (
            <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">
              {isMac ? "⌘K" : "Ctrl K"}
            </kbd>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {visible.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {t("nav.searchEmpty")}
          </p>
        )}
        <ul className="space-y-0.5">
          {visible.map((entry) => {
            if (!isGroup(entry)) {
              const active = entry.href === current;
              return (
                <li key={entry.href}>
                  <Link
                    href={entry.href}
                    onClick={navigate}
                    aria-current={active ? "page" : undefined}
                    className={linkClass(active)}
                  >
                    <entry.icon className="size-4 shrink-0" />
                    {t(entry.label)}
                  </Link>
                </li>
              );
            }

            const open = term !== "" || !closed.has(entry.label);
            const containsActive = entry.items.some((item) => item.href === current);
            const listId = `nav-${entry.label.replace(".", "-")}`;
            return (
              <li key={entry.label}>
                <button
                  type="button"
                  onClick={() => toggle(entry.label)}
                  aria-expanded={open}
                  aria-controls={listId}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    containsActive
                      ? "bg-accent/50 text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <entry.icon className={cn("size-4 shrink-0", containsActive && "text-primary")} />
                  <span className="min-w-0 flex-1 truncate">{t(entry.label)}</span>
                  <ChevronDown
                    className={cn("size-4 shrink-0 transition-transform", !open && "-rotate-90")}
                  />
                </button>
                {open && (
                  <ul id={listId} className="my-0.5 ml-5 space-y-0.5 border-l border-border pl-2">
                    {entry.items.map((item) => {
                      const active = item.href === current;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={navigate}
                            aria-current={active ? "page" : undefined}
                            className={linkClass(active)}
                          >
                            <item.icon className="size-4 shrink-0" />
                            <span className="min-w-0 truncate">{t(item.label)}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
