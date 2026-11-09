import { and, eq, ne, or, sql } from "drizzle-orm";
import { Banknote, Receipt } from "lucide-react";
import Link from "next/link";
import type { getDb } from "@/db";
import { users, type Branch, type Pharmacy } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import type { getT } from "@/i18n/server";
import type { SessionUser } from "@/lib/auth";
import type { ShiftActivity } from "@/lib/cash-drawer";
import type { Format } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StaffOption } from "./cash-inputs";

/* Pieces shared by the cash drawer tabs and the session page. */

export type Ctx = {
  user: SessionUser;
  pharmacy: Pharmacy;
  branch: Branch;
  branches: Branch[];
  t: Awaited<ReturnType<typeof getT>>;
  f: Format;
  db: Awaited<ReturnType<typeof getDb>>;
};

export const ACTIVITY_LABEL: Record<ShiftActivity["kind"], MessageKey> = {
  sale: "cashDrawer.kindSale",
  refund: "cashDrawer.kindRefund",
  in: "cashDrawer.kindIn",
  out: "cashDrawer.kindOut",
  expense: "cashDrawer.kindExpense",
  drop: "cashDrawer.kindDrop",
  no_sale: "cashDrawer.kindNoSale",
};

export const ACTIVITY_TONE: Record<ShiftActivity["kind"], string> = {
  sale: "bg-success/15 text-success",
  refund: "bg-destructive/15 text-destructive",
  in: "bg-success/15 text-success",
  out: "bg-warning/15 text-warning",
  expense: "bg-warning/15 text-warning",
  drop: "bg-info/15 text-info",
  no_sale: "bg-muted text-muted-foreground",
};

/** Everyone who may take a drawer in this branch: its staff and the admins. */
export async function drawerStaff(ctx: Pick<Ctx, "db" | "pharmacy" | "branch">): Promise<
  (StaffOption & { role: string })[]
> {
  return ctx.db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      hasPin: sql<boolean>`${users.pinHash} is not null`,
    })
    .from(users)
    .where(
      and(
        eq(users.pharmacyId, ctx.pharmacy.id),
        eq(users.isActive, true),
        ne(users.role, "superadmin"),
        or(eq(users.role, "admin"), eq(users.branchId, ctx.branch.id)),
      ),
    )
    .orderBy(users.name);
}

const CATEGORY_LABEL: Record<string, MessageKey> = {
  float_topup: "cashDrawer.payIn_float_topup",
  supplies: "cashDrawer.payOut_supplies",
  transport: "cashDrawer.payOut_transport",
  cleaning: "cashDrawer.payOut_cleaning",
};

export function categoryLabel(kind: ShiftActivity["kind"], category: string | null, t: Ctx["t"]) {
  if (!category) return null;
  if (category === "other") return t(kind === "in" ? "cashDrawer.payIn_other" : "cashDrawer.payOut_other");
  const key = CATEGORY_LABEL[category];
  return key ? t(key) : null;
}

export function ActivityList({ rows, t, f }: { rows: ShiftActivity[]; t: Ctx["t"]; f: Format }) {
  if (rows.length === 0) {
    return <p className="px-6 py-14 text-center text-muted-foreground">{t("cashDrawer.activityEmpty")}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const category = row.categoryName ?? categoryLabel(row.kind, row.category, t);
        const detail = [category, row.kind === "drop" ? null : row.label || null].filter(Boolean).join(" · ");
        return (
          <li key={row.key} className="flex items-center gap-4 px-6 py-3">
            <span
              className={cn(
                "w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium",
                ACTIVITY_TONE[row.kind],
              )}
            >
              {t(ACTIVITY_LABEL[row.kind])}
            </span>
            <div className="min-w-0 flex-1">
              {row.saleId ? (
                <Link href={`/sales/${row.saleId}`} className="text-sm font-medium hover:text-primary hover:underline">
                  {row.label}
                </Link>
              ) : (
                <p className="truncate text-sm font-medium">
                  {row.kind === "drop" ? t("cashDrawer.bag", { number: row.bagNumber ?? "—" }) : detail || "—"}
                </p>
              )}
              <p className="truncate text-xs text-muted-foreground">
                {f.dateTime(row.at)}
                {row.userName && ` · ${row.userName}`}
              </p>
            </div>
            {row.hasReceipt && row.movementId && (
              <a
                href={`/cash-drawer/receipts/${row.movementId}`}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-primary"
                aria-label={t("cashDrawer.viewReceipt")}
                title={t("cashDrawer.viewReceipt")}
              >
                <Receipt className="size-4" />
              </a>
            )}
            {row.kind === "no_sale" ? (
              <Banknote className="size-4 text-muted-foreground" aria-hidden />
            ) : (
              <span
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  row.amount >= 0 ? "text-success" : "text-destructive",
                )}
              >
                {row.amount >= 0 ? "+" : "−"}
                {f.money(Math.abs(row.amount))}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
