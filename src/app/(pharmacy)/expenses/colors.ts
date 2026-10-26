import type { ExpenseColor } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";

/** Background class of a category's colour dot (theme tokens, so dark mode works). */
export const EXPENSE_COLOR_DOT: Record<ExpenseColor, string> = {
  teal: "bg-chart-1",
  amber: "bg-chart-2",
  indigo: "bg-chart-3",
  red: "bg-chart-4",
  green: "bg-success",
  orange: "bg-warning",
  blue: "bg-info",
  gray: "bg-muted-foreground",
};

export const EXPENSE_COLOR_LABEL: Record<ExpenseColor, MessageKey> = {
  teal: "expenses.colorTeal",
  amber: "expenses.colorAmber",
  indigo: "expenses.colorIndigo",
  red: "expenses.colorRed",
  green: "expenses.colorGreen",
  orange: "expenses.colorOrange",
  blue: "expenses.colorBlue",
  gray: "expenses.colorGray",
};
