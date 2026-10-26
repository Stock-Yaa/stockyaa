"use client";

import {
  AlarmClock,
  ArrowLeftRight,
  Bell,
  Bot,
  Boxes,
  Brain,
  Building2,
  Calculator,
  ChartColumn,
  ChartLine,
  ChartSpline,
  CircleUser,
  ClipboardList,
  Contact,
  CreditCard,
  FileUp,
  History,
  House,
  Layers,
  LogOut,
  Menu,
  MessagesSquare,
  Pill,
  Plug,
  ReceiptText,
  Settings,
  Settings2,
  ShieldAlert,
  Send,
  ShoppingBasket,
  ShoppingCart,
  Star,
  Store,
  TriangleAlert,
  Truck,
  UserCog,
  UserRound,
  Users,
  UsersRound,
  Wallet,
  Warehouse,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { logout } from "@/app/login/actions";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import { BranchSwitcher } from "./branch-switcher";
import { LocaleSwitcher } from "./locale-switcher";
import { Logo } from "./logo";
import { SidebarNav, type NavEntry, type NavLink } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";

const PHARMACY_NAV: NavEntry[] = [
  { href: "/dashboard", label: "nav.dashboard", icon: House },
  {
    label: "nav.groupPos",
    icon: ShoppingCart,
    items: [
      { href: "/pos", label: "nav.pos", icon: ShoppingCart },
      { href: "/sales", label: "nav.salesHistory", icon: History },
      { href: "/cash-drawer", label: "nav.cashDrawer", icon: Calculator },
    ],
  },
  {
    label: "nav.groupCustomers",
    icon: Users,
    items: [
      { href: "/customers", label: "nav.customerList", icon: Contact },
      { href: "/customers/insights", label: "nav.customerInsights", icon: Star },
      { href: "/customers/reminders", label: "nav.refillReminders", icon: AlarmClock },
    ],
  },
  {
    label: "nav.groupInventory",
    icon: Warehouse,
    items: [
      { href: "/products", label: "nav.products", icon: Pill },
      { href: "/inventory", label: "nav.inventory", icon: Boxes },
      { href: "/inventory/alerts", label: "nav.stockAlerts", icon: TriangleAlert },
      { href: "/inventory/movements", label: "nav.stockMovements", icon: ArrowLeftRight },
      { href: "/inventory/branches", label: "nav.stockByBranch", icon: Store, adminOnly: true },
      { href: "/transfers", label: "nav.stockTransfers", icon: Send },
      { href: "/inventory/import", label: "nav.bulkImport", icon: FileUp },
    ],
  },
  {
    label: "nav.groupProcurement",
    icon: ShoppingBasket,
    items: [
      { href: "/purchases", label: "nav.purchaseOrders", icon: ClipboardList },
      { href: "/suppliers", label: "nav.suppliers", icon: Truck },
    ],
  },
  {
    label: "nav.groupReports",
    icon: ChartLine,
    items: [
      { href: "/reports", label: "nav.reports", icon: ChartColumn },
      { href: "/expenses", label: "nav.expenses", icon: ReceiptText },
    ],
  },
  {
    label: "nav.groupAi",
    icon: Brain,
    items: [
      { href: "/ai/assistant", label: "nav.aiAssistant", icon: MessagesSquare },
      { href: "/ai/forecast", label: "nav.demandForecast", icon: ChartSpline },
      { href: "/ai/anomalies", label: "nav.anomalies", icon: ShieldAlert },
      { href: "/ai/analytics", label: "nav.aiAnalytics", icon: Bot },
    ],
  },
  {
    label: "nav.groupAccount",
    icon: CircleUser,
    items: [
      { href: "/notifications", label: "nav.notifications", icon: Bell },
      { href: "/profile", label: "nav.profile", icon: UserRound },
    ],
  },
  {
    label: "nav.groupAdmin",
    icon: UserCog,
    items: [
      { href: "/branches", label: "nav.branches", icon: Store, adminOnly: true },
      { href: "/users", label: "nav.users", icon: UsersRound, adminOnly: true },
      { href: "/ai/settings", label: "nav.aiConfig", icon: Settings2, adminOnly: true },
      { href: "/subscription", label: "nav.billing", icon: CreditCard },
      { href: "/settings", label: "nav.settings", icon: Settings },
    ],
  },
];

const PLATFORM_NAV: NavEntry[] = [
  { href: "/superadmin", label: "nav.dashboard", icon: House },
  {
    label: "nav.groupPlatform",
    icon: Building2,
    items: [
      { href: "/superadmin/pharmacies", label: "nav.pharmacies", icon: Building2 },
      { href: "/superadmin/payments", label: "nav.payments", icon: Wallet },
      { href: "/superadmin/plans", label: "nav.plans", icon: Layers },
      { href: "/superadmin/stripe", label: "nav.stripe", icon: Plug },
    ],
  },
  {
    label: "nav.groupAccount",
    icon: CircleUser,
    items: [{ href: "/superadmin/account", label: "nav.account", icon: UserRound }],
  },
];

/** The menu without the admin-only links, for staff. */
function staffNav(entries: NavEntry[]): NavEntry[] {
  const visible = (link: NavLink) => !link.adminOnly;
  return entries.flatMap((entry): NavEntry[] => {
    if (!("items" in entry)) return visible(entry) ? [entry] : [];
    const items = entry.items.filter(visible);
    return items.length > 0 ? [{ ...entry, items }] : [];
  });
}

const STAFF_NAV = staffNav(PHARMACY_NAV);

const ROLE_LABEL: Record<string, MessageKey> = {
  superadmin: "nav.platformAdmin",
  admin: "nav.pharmacyAdmin",
  staff: "nav.staff",
};

/**
 * Page frame shared by the pharmacy and super admin areas: sidebar, top bar
 * with language/theme switchers and sign out. `banner` renders above the page
 * content (used for subscription notices).
 */
export function AppShell({
  variant,
  orgName,
  user,
  banner,
  unreadNotifications,
  children,
}: {
  variant: "pharmacy" | "platform";
  orgName: string;
  user: { name: string; role: string };
  banner?: React.ReactNode;
  /** Shows a bell linking to /notifications, with this many unread. */
  unreadNotifications?: number;
  children: React.ReactNode;
}) {
  const t = useT();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const entries =
    variant === "platform"
      ? PLATFORM_NAV
      : user.role === "admin"
        ? PHARMACY_NAV
        : STAFF_NAV;
  const home = variant === "platform" ? "/superadmin" : "/dashboard";

  const brand = (
    <Link href={home} className="flex h-14 shrink-0 items-center gap-2 px-5">
      <Logo />
    </Link>
  );

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-card lg:flex print:hidden">
        {brand}
        <SidebarNav entries={entries} shortcut />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-card">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label={t("common.close")}
                className="rounded-md p-2 text-muted-foreground hover:bg-muted"
              >
                <X className="size-5" />
              </button>
            </div>
            <SidebarNav entries={entries} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-h-dvh flex-col lg:pl-64 print:pl-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card/90 px-4 backdrop-blur sm:px-6 print:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={t("common.menu")}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <p
              className={`min-w-0 truncate text-sm font-semibold ${variant === "pharmacy" ? "hidden sm:block" : ""}`}
            >
              {orgName}
            </p>
            {variant === "pharmacy" && <BranchSwitcher />}
          </div>
          {unreadNotifications !== undefined && (
            <Link
              href="/notifications"
              title={t("nav.notifications")}
              aria-label={
                unreadNotifications > 0
                  ? `${t("nav.notifications")} (${unreadNotifications})`
                  : t("nav.notifications")
              }
              className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Bell className="size-5" />
              {unreadNotifications > 0 && (
                <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-destructive-foreground tabular-nums">
                  {unreadNotifications > 99 ? "99+" : unreadNotifications}
                </span>
              )}
            </Link>
          )}
          <LocaleSwitcher />
          <ThemeToggle />
          <div className="ml-1 hidden min-w-0 text-right sm:block">
            <p className="truncate text-sm leading-tight font-medium">{user.name}</p>
            <p className="text-xs leading-tight text-muted-foreground">
              {t(ROLE_LABEL[user.role] ?? "nav.staff")}
            </p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              title={t("common.signOut")}
              aria-label={t("common.signOut")}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="size-5" />
            </button>
          </form>
        </header>
        {banner}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
