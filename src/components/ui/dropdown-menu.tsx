"use client";

import { EllipsisVertical, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type MenuItem =
  | {
      label: string;
      icon?: LucideIcon;
      /** Navigates when set; otherwise `onSelect` runs. */
      href?: string;
      onSelect?: () => void;
      disabled?: boolean;
      /** Small second line, e.g. why the item is disabled. */
      hint?: string;
      tone?: "danger";
    }
  | "separator";

const MENU_WIDTH = 240;

/**
 * "⋮" button that opens a menu of actions. The menu is rendered in a portal
 * with fixed positioning so a scrolling table cannot clip it; it closes on an
 * outside click, Escape, resize, or a scroll that moves the button.
 */
export function DropdownMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Where the button was when the menu opened; scrolling that moves it closes the menu.
  const anchorRef = useRef<{ top: number; left: number } | null>(null);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number } | null>(
    null,
  );
  const open = position !== null;

  function toggle() {
    if (open) return setPosition(null);
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    anchorRef.current = { top: rect.top, left: rect.left };
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    // Open upwards when there is not enough room below the button.
    const below = window.innerHeight - rect.bottom;
    setPosition(
      below < 320 && rect.top > below
        ? { bottom: window.innerHeight - rect.top + 4, left }
        : { top: rect.bottom + 4, left },
    );
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setPosition(null);
    // Browsers scroll a container to reveal a tapped button; only real movement counts.
    const onScroll = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      const anchor = anchorRef.current;
      if (!rect || !anchor) return close();
      if (Math.abs(rect.top - anchor.top) > 4 || Math.abs(rect.left - anchor.left) > 4) close();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]:not([aria-disabled=true])")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function onMenuKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const enabled = [
      ...(menuRef.current?.querySelectorAll<HTMLElement>(
        "[role=menuitem]:not([aria-disabled=true])",
      ) ?? []),
    ];
    const index = enabled.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    enabled[(next + enabled.length) % enabled.length]?.focus();
  }

  const itemClass = (tone?: "danger", disabled?: boolean) =>
    cn(
      "flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-sm outline-none",
      disabled
        ? "cursor-not-allowed opacity-50"
        : "hover:bg-muted focus-visible:bg-muted",
      tone === "danger" ? "text-destructive" : "text-foreground",
    );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <EllipsisVertical className="size-4" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            className="fixed z-50 rounded-xl border border-border bg-card p-1.5 text-card-foreground shadow-xl"
            style={{ ...position, width: MENU_WIDTH }}
          >
            {items.map((item, index) => {
              if (item === "separator") {
                return <div key={`sep-${index}`} className="my-1 h-px bg-border" role="separator" />;
              }
              const Icon = item.icon;
              const content = (
                <>
                  {Icon && <Icon className="mt-0.5 size-4 shrink-0" />}
                  <span className="min-w-0">
                    <span className="block">{item.label}</span>
                    {item.hint && (
                      <span className="block text-xs text-muted-foreground">{item.hint}</span>
                    )}
                  </span>
                </>
              );
              return (
                <Fragment key={item.label}>
                  {item.href && !item.disabled ? (
                    <Link
                      href={item.href}
                      role="menuitem"
                      className={itemClass(item.tone)}
                      onClick={() => setPosition(null)}
                    >
                      {content}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      aria-disabled={item.disabled || undefined}
                      className={itemClass(item.tone, item.disabled)}
                      onClick={() => {
                        if (item.disabled) return;
                        setPosition(null);
                        item.onSelect?.();
                      }}
                    >
                      {content}
                    </button>
                  )}
                </Fragment>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
