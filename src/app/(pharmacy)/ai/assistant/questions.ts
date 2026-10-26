import type { MessageKey } from "@/i18n/messages";

/** The questions the assistant can answer, in the order they are suggested. */
export const QUESTIONS = [
  "bestSeller",
  "expiring",
  "revenueWeek",
  "inactiveCustomers",
  "profitMargin",
  "lowStock",
  "topExpenses",
  "salesToday",
] as const;

export type QuestionId = (typeof QUESTIONS)[number];

export const QUESTION_LABEL: Record<QuestionId, MessageKey> = {
  bestSeller: "assistant.qBestSeller",
  expiring: "assistant.qExpiring",
  revenueWeek: "assistant.qRevenueWeek",
  inactiveCustomers: "assistant.qInactiveCustomers",
  profitMargin: "assistant.qProfitMargin",
  lowStock: "assistant.qLowStock",
  topExpenses: "assistant.qTopExpenses",
  salesToday: "assistant.qSalesToday",
};

/**
 * Words that point to each question, in English and Thai. Checked in this
 * order, so the more specific topics come first: "ใกล้หมดอายุ" (expiring) also
 * contains "ใกล้หมด" (running low), and "top expenses" also contains "top".
 */
const KEYWORDS: [QuestionId, RegExp][] = [
  ["expiring", /expir|หมดอายุ/],
  ["lowStock", /low stock|out of stock|reorder|running low|stock level|สต็อกต่ำ|ใกล้หมด|ของหมด|สินค้าหมด/],
  ["inactiveCustomers", /customer|patient|visit|ลูกค้า/],
  ["topExpenses", /expense|costs|bills|ค่าใช้จ่าย|รายจ่าย/],
  ["profitMargin", /profit|margin|กำไร/],
  ["bestSeller", /best|top|popular|selling|ขายดี/],
  ["salesToday", /today|วันนี้/],
  ["revenueWeek", /revenue|income|earn|week|sales|ยอดขาย|รายได้|สัปดาห์/],
];

/** Which question a typed message asks, or null when none fits. */
export function matchQuestion(text: string): QuestionId | null {
  const lower = text.toLowerCase();
  return KEYWORDS.find(([, pattern]) => pattern.test(lower))?.[0] ?? null;
}

/** A reply, already translated and formatted on the server. */
export type AssistantAnswer = {
  text: string;
  rows?: { label: string; value: string; hint?: string }[];
  /** Where to see or act on the full data. */
  link?: { href: string; label: string };
  /** Shown under the answer, e.g. which branch the figures cover. */
  note?: string;
  /** The question was not understood: offer the suggestions again. */
  suggest?: boolean;
};
