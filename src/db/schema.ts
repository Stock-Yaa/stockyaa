import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const money = (name: string) =>
  numeric(name, { precision: 12, scale: 2, mode: "number" });

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// A manager works in one branch like staff, and also runs its cash drawers:
// approves pay-outs, reviews counts and closes forgotten sessions.
export const USER_ROLES = ["superadmin", "admin", "manager", "staff"] as const;
export const PHARMACY_STATUSES = ["active", "suspended"] as const;
export const SUBSCRIPTION_STATUSES = ["trial", "active", "cancelled"] as const;
// Standard: one branch and one admin. Multi branch: up to maxBranches
// branches, any number of admins.
export const PLAN_TYPES = ["standard", "multi_branch"] as const;
export const PURCHASE_STATUSES = ["ordered", "received", "cancelled"] as const;
export const SALE_STATUSES = ["completed", "refunded"] as const;
export const PAYMENT_METHODS = ["cash", "card", "transfer"] as const;
// Selling price levels: every product has a regular price and may have a
// member and a staff price; a customer's level decides which one they pay.
export const PRICE_LEVELS = ["regular", "member", "staff"] as const;
// Running document numbers (see src/lib/numbering.ts), each with its own counter.
export const DOCUMENT_SERIES = ["sale", "tax", "credit", "purchase", "transfer"] as const;
// What identifies the buyer of a full tax receipt: a 13-digit Thai tax ID, or
// a passport number for a foreign buyer.
export const BUYER_ID_TYPES = ["tax_id", "passport"] as const;
// Date part of invoice numbers; the counter restarts whenever it changes.
export const INVOICE_DATE_FORMATS = ["none", "YYYY", "YYYYMM", "YYYYMMDD", "YYMM", "YYMMDD"] as const;
export const BILLING_METHODS = ["cash", "transfer", "stripe"] as const;
export const BILLING_PAYMENT_STATUSES = ["succeeded", "failed", "refunded"] as const;
// in = pay-in, out = pay-out (a petty cost paid from the drawer), drop = cash
// taken to the safe, no_sale = the drawer opened without a sale (amount 0).
// "expense" is the pay-out type of shifts recorded before pay-outs had categories.
export const CASH_MOVEMENT_TYPES = ["in", "out", "expense", "drop", "no_sale"] as const;
export const PAY_IN_CATEGORIES = ["float_topup", "other"] as const;
export const PAY_OUT_CATEGORIES = ["supplies", "transport", "cleaning", "other"] as const;
// Things a manager has to look at: a closing count that is out by more than
// the small tolerance, an opening count that differs from what the last
// session left, and a pay-out over the approval limit saved without a manager PIN.
export const CASH_REVIEW_KINDS = ["variance", "opening", "payout"] as const;
export const CASH_REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
// Dot colour of an expense category; each maps to a theme token (see expense-colors.ts).
export const EXPENSE_COLORS = [
  "teal",
  "amber",
  "indigo",
  "red",
  "green",
  "orange",
  "blue",
  "gray",
] as const;
export const NOTIFICATION_TYPES = [
  "out_of_stock",
  "low_stock",
  "expired",
  "expiring",
  "subscription_ended",
  "subscription_ending",
  "cash_review",
  "price_discount",
] as const;
export const MOVEMENT_TYPES = [
  "opening",
  "purchase",
  "sale",
  "refund",
  "adjustment",
  "transfer_out",
  "transfer_in",
] as const;
// A transfer leaves the sending branch when created and reaches the other
// branch when received; cancelling one in transit returns the stock.
export const TRANSFER_STATUSES = ["in_transit", "received", "cancelled"] as const;

// ---------------------------------------------------------------------------
// Platform (super admin)
// ---------------------------------------------------------------------------

export const plans = pgTable("plans", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  priceMonthly: money("price_monthly").notNull().default(0),
  // null = no yearly option.
  priceYearly: money("price_yearly"),
  currency: text("currency").notNull().default("THB"),
  type: text("type", { enum: PLAN_TYPES }).notNull().default("standard"),
  // How many active branches a pharmacy on this plan may run (always 1 on Standard).
  maxBranches: integer("max_branches").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const pharmacies = pgTable("pharmacies", {
  id: id(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  licenseNumber: text("license_number"),
  taxId: text("tax_id"),
  currency: text("currency").notNull().default("THB"),
  timezone: text("timezone").notNull().default("Asia/Bangkok"),
  // Selling prices always include VAT. A VAT-registered pharmacy shows the VAT
  // inside each sale (taxRate %) and can issue tax receipts; otherwise there
  // is no VAT at all.
  vatRegistered: boolean("vat_registered").notNull().default(false),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2, mode: "number" })
    .notNull()
    .default(7),
  // Member and staff prices of products without their own: this many percent
  // off the regular price (null = the regular price).
  memberDiscount: numeric("member_discount", { precision: 5, scale: 2, mode: "number" }),
  staffDiscount: numeric("staff_discount", { precision: 5, scale: 2, mode: "number" }),
  // Batches expiring within this many days are flagged as "expiring soon".
  expiryAlertDays: integer("expiry_alert_days").notNull().default(90),
  receiptFooter: text("receipt_footer"),
  status: text("status", { enum: PHARMACY_STATUSES }).notNull().default("active"),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  subscriptionStatus: text("subscription_status", { enum: SUBSCRIPTION_STATUSES })
    .notNull()
    .default("trial"),
  // null = no end date.
  subscriptionEndsAt: timestamp("subscription_ends_at", { withTimezone: true }),
  // Document number format (see src/lib/numbering.ts): a prefix per series,
  // then a shared optional date part and counter digits, e.g. INV- + YYYYMM
  // + 3 = INV-202611001. The counters live in document_counters and restart
  // when the date part changes. With numberPerBranch each branch counts on
  // its own and its code follows the prefix (INV-SKV-202611001).
  invoicePrefix: text("invoice_prefix").notNull().default("INV-"),
  invoiceDateFormat: text("invoice_date_format", { enum: INVOICE_DATE_FORMATS })
    .notNull()
    .default("none"),
  invoiceBuddhistYear: boolean("invoice_buddhist_year").notNull().default(false),
  invoiceDigits: integer("invoice_digits").notNull().default(6),
  taxInvoicePrefix: text("tax_invoice_prefix").notNull().default("TAX-"),
  creditNotePrefix: text("credit_note_prefix").notNull().default("CN-"),
  purchasePrefix: text("purchase_prefix").notNull().default("PO-"),
  transferPrefix: text("transfer_prefix").notNull().default("TR-"),
  numberPerBranch: boolean("number_per_branch").notNull().default(false),
  // Last automatic notification scan, so page loads scan at most every few minutes.
  notificationsScannedAt: timestamp("notifications_scanned_at", { withTimezone: true }),
  // Cash drawer rules. A closing count out by up to cashMinorTolerance only
  // needs a reason; beyond it the cashier may recount (cashRecounts times) and
  // then a manager reviews it; beyond cashMajorTolerance the drawer is also
  // blocked until the manager decides. Pay-outs above payoutApprovalLimit need
  // a manager.
  cashMinorTolerance: money("cash_minor_tolerance").notNull().default(20),
  cashMajorTolerance: money("cash_major_tolerance").notNull().default(200),
  payoutApprovalLimit: money("payout_approval_limit").notNull().default(300),
  cashRecounts: integer("cash_recounts").notNull().default(1),
  createdAt: createdAt(),
});

/**
 * A location of a pharmacy. Products, prices, customers and suppliers are
 * shared by every branch; stock, sales, purchases and the cash drawer belong
 * to one. Branches are deactivated, never deleted, so their history stays.
 */
export const branches = pgTable(
  "branches",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    phone: text("phone"),
    // Branch number printed on tax receipts (Thai Revenue Department): 00000 = head office.
    taxBranchCode: text("tax_branch_code"),
    // Short code in document numbers when each branch has its own (e.g. SKV).
    code: text("code"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("branches_pharmacy_name_idx").on(t.pharmacyId, t.name),
    uniqueIndex("branches_pharmacy_code_idx").on(t.pharmacyId, t.code),
  ],
);

/**
 * Where a document series' counter is: the last number issued (seq) in date
 * part `period` ("" without one). `scope` is "" for the whole pharmacy, or a
 * branch id when each branch has its own numbers.
 */
export const documentCounters = pgTable(
  "document_counters",
  {
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    series: text("series", { enum: DOCUMENT_SERIES }).notNull(),
    scope: text("scope").notNull().default(""),
    seq: integer("seq").notNull().default(0),
    period: text("period").notNull().default(""),
  },
  (t) => [uniqueIndex("document_counters_key_idx").on(t.pharmacyId, t.series, t.scope)],
);

export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    // Always stored lower-cased.
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: USER_ROLES }).notNull(),
    // null for super admins.
    pharmacyId: uuid("pharmacy_id").references(() => pharmacies.id, {
      onDelete: "cascade",
    }),
    // The one branch a manager or staff member works in. null for admins, who
    // work in every branch, and for super admins.
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    // bcrypt hash of the 4-6 digit PIN used at the cash drawer; null = no PIN yet.
    pinHash: text("pin_hash"),
    // Wrong PINs in a row; at the limit the PIN is locked until pinLockedUntil.
    pinFailures: integer("pin_failures").notNull().default(0),
    pinLockedUntil: timestamp("pin_locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/**
 * Subscription payments from pharmacies to the platform: recorded by hand
 * (cash, transfer) or, later, by Stripe. Kept when a pharmacy or plan is
 * deleted, with their names copied in, so platform revenue stays complete.
 */
export const billingPayments = pgTable(
  "billing_payments",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id").references(() => pharmacies.id, {
      onDelete: "set null",
    }),
    pharmacyName: text("pharmacy_name").notNull(),
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
    planName: text("plan_name"),
    amount: money("amount").notNull(),
    currency: text("currency").notNull(),
    method: text("method", { enum: BILLING_METHODS }).notNull(),
    status: text("status", { enum: BILLING_PAYMENT_STATUSES })
      .notNull()
      .default("succeeded"),
    // Whole months of access this payment bought (12 = one year).
    months: integer("months"),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    reference: text("reference"),
    note: text("note"),
    stripeInvoiceId: text("stripe_invoice_id"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    index("billing_payments_paid_idx").on(t.paidAt),
    index("billing_payments_pharmacy_idx").on(t.pharmacyId, t.paidAt),
    uniqueIndex("billing_payments_stripe_invoice_idx").on(t.stripeInvoiceId),
  ],
);

// ---------------------------------------------------------------------------
// Tenant data: every table below carries pharmacy_id and every query must
// filter on it.
// ---------------------------------------------------------------------------

export const categories = pgTable(
  "categories",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("categories_pharmacy_name_idx").on(t.pharmacyId, t.name)],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    genericName: text("generic_name"),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    manufacturer: text("manufacturer"),
    dosageForm: text("dosage_form"),
    strength: text("strength"),
    barcode: text("barcode"),
    unit: text("unit").notNull().default("pcs"),
    // Regular price. Member and staff prices are optional: a fixed price, or a
    // percent off the regular price (at most one of the two is set). Neither =
    // the pharmacy's rule, or the regular price.
    salePrice: money("sale_price").notNull().default(0),
    memberPrice: money("member_price"),
    staffPrice: money("staff_price"),
    memberDiscount: numeric("member_discount", { precision: 5, scale: 2, mode: "number" }),
    staffDiscount: numeric("staff_discount", { precision: 5, scale: 2, mode: "number" }),
    // Default cost used to pre-fill purchases; real cost lives on each batch.
    costPrice: money("cost_price").notNull().default(0),
    reorderLevel: integer("reorder_level").notNull().default(10),
    requiresPrescription: boolean("requires_prescription").notNull().default(false),
    // Products with history are archived (isActive = false), never deleted.
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index("products_pharmacy_name_idx").on(t.pharmacyId, t.name),
    index("products_pharmacy_barcode_idx").on(t.pharmacyId, t.barcode),
  ],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contactPerson: text("contact_person"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    taxId: text("tax_id"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("suppliers_pharmacy_idx").on(t.pharmacyId)],
);

export const purchases = pgTable(
  "purchases",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    // The branch the goods are delivered to.
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    // Human-readable number, e.g. PO-000012 (see nextPurchaseReference).
    reference: text("reference").notNull(),
    supplierId: uuid("supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    supplierInvoice: text("supplier_invoice"),
    status: text("status", { enum: PURCHASE_STATUSES }).notNull().default("ordered"),
    total: money("total").notNull().default(0),
    notes: text("notes"),
    orderedAt: timestamp("ordered_at", { withTimezone: true }).notNull().defaultNow(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("purchases_pharmacy_idx").on(t.pharmacyId, t.orderedAt),
    index("purchases_branch_idx").on(t.branchId, t.orderedAt),
  ],
);

export const purchaseItems = pgTable(
  "purchase_items",
  {
    id: id(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    batchNumber: text("batch_number"),
    // YYYY-MM-DD
    expiryDate: date("expiry_date", { mode: "string" }),
    quantity: integer("quantity").notNull(),
    costPrice: money("cost_price").notNull().default(0),
  },
  (t) => [index("purchase_items_purchase_idx").on(t.purchaseId)],
);

export const batches = pgTable(
  "batches",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    batchNumber: text("batch_number"),
    // YYYY-MM-DD, null = no expiry.
    expiryDate: date("expiry_date", { mode: "string" }),
    // Units currently on hand in this batch.
    quantity: integer("quantity").notNull().default(0),
    costPrice: money("cost_price").notNull().default(0),
    purchaseId: uuid("purchase_id").references(() => purchases.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index("batches_pharmacy_product_idx").on(t.pharmacyId, t.productId),
    index("batches_pharmacy_expiry_idx").on(t.pharmacyId, t.expiryDate),
    index("batches_branch_product_idx").on(t.branchId, t.productId),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id").references(() => batches.id, { onDelete: "set null" }),
    type: text("type", { enum: MOVEMENT_TYPES }).notNull(),
    // Signed: positive adds stock, negative removes it.
    quantity: integer("quantity").notNull(),
    reason: text("reason"),
    // Sale, purchase or transfer id this movement belongs to, when there is one.
    referenceId: uuid("reference_id"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("stock_movements_pharmacy_idx").on(t.pharmacyId, t.createdAt),
    index("stock_movements_branch_idx").on(t.branchId, t.createdAt),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    notes: text("notes"),
    // Pre-fill full tax receipts: tax ID and head office / branch number.
    taxIdType: text("tax_id_type", { enum: BUYER_ID_TYPES }).notNull().default("tax_id"),
    taxId: text("tax_id"),
    taxBranch: text("tax_branch"),
    // Which selling price the customer pays at the POS.
    priceLevel: text("price_level", { enum: PRICE_LEVELS }).notNull().default("regular"),
    createdAt: createdAt(),
  },
  (t) => [index("customers_pharmacy_idx").on(t.pharmacyId)],
);

export const sales = pgTable(
  "sales",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    // Human-readable number, e.g. INV-000123 (see nextInvoiceNumber).
    invoiceNumber: text("invoice_number").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    subtotal: money("subtotal").notNull().default(0),
    discount: money("discount").notNull().default(0),
    tax: money("tax").notNull().default(0),
    total: money("total").notNull().default(0),
    paymentMethod: text("payment_method", { enum: PAYMENT_METHODS })
      .notNull()
      .default("cash"),
    amountPaid: money("amount_paid").notNull().default(0),
    changeDue: money("change_due").notNull().default(0),
    status: text("status", { enum: SALE_STATUSES }).notNull().default("completed"),
    // The selling price the items were charged at (the customer's level).
    priceLevel: text("price_level", { enum: PRICE_LEVELS }).notNull().default("regular"),
    // true: the total includes the VAT in `tax`; false (sales before VAT-inclusive
    // pricing): `tax` was added on top of subtotal - discount.
    taxIncluded: boolean("tax_included").notNull().default(true),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    notes: text("notes"),
    // The cash drawer session the sale was rung up in (required for cash), and
    // the one whose drawer paid out a cash refund.
    shiftId: uuid("shift_id").references(() => cashShifts.id, { onDelete: "set null" }),
    refundShiftId: uuid("refund_shift_id").references(() => cashShifts.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index("sales_pharmacy_created_idx").on(t.pharmacyId, t.createdAt),
    index("sales_branch_created_idx").on(t.branchId, t.createdAt),
    index("sales_shift_idx").on(t.shiftId),
    index("sales_refund_shift_idx").on(t.refundShiftId),
    uniqueIndex("sales_pharmacy_invoice_idx").on(t.pharmacyId, t.invoiceNumber),
  ],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: id(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    batchId: uuid("batch_id").references(() => batches.id, { onDelete: "set null" }),
    // Snapshot so receipts stay correct if the product is renamed later.
    productName: text("product_name").notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
    // Cost of the batch the units came from, for profit reporting.
    costPrice: money("cost_price").notNull().default(0),
    total: money("total").notNull(),
  },
  (t) => [index("sale_items_sale_idx").on(t.saleId)],
);

/** How many of each note and coin, keyed by face value ("1000": 2). */
export type CashCounts = Record<string, number>;

/** One count of the drawer at closing, kept so recounts can be compared. */
export type CashCountAttempt = {
  counts: CashCounts | null;
  total: number;
  expected: number;
  userId: string;
  at: string;
};

/**
 * A cash drawer of a branch (front counter, consult desk, …). Each one has its
 * own sessions; whatever cash a session leaves is counted by the next one.
 * Deactivated, never deleted, so its history stays.
 */
export const cashDrawers = pgTable(
  "cash_drawers",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("cash_drawers_branch_name_idx").on(t.branchId, t.name)],
);

/**
 * A cash drawer session (shift). At most one is open per drawer (closedAt is
 * null). Expected cash = opening balance + cash sales - cash refunds + pay-ins
 * - pay-outs - expenses - drops. Sales and refunds point at the session whose
 * drawer took or paid the cash, so a closed session never changes; its totals
 * are also copied in when it closes.
 */
export const cashShifts = pgTable(
  "cash_shifts",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    drawerId: uuid("drawer_id")
      .notNull()
      .references(() => cashDrawers.id, { onDelete: "cascade" }),
    // Whoever entered their PIN to open it: the person accountable for the drawer.
    openedBy: uuid("opened_by").references(() => users.id, { onDelete: "set null" }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    // The float counted into the drawer, and how it was made up.
    openingBalance: money("opening_balance").notNull(),
    openingCounts: jsonb("opening_counts").$type<CashCounts>(),
    // What the previous session of the drawer left in it; null for a drawer's first session.
    previousShiftId: uuid("previous_shift_id"),
    expectedOpening: money("expected_opening"),
    // Counts of the drawer at closing; the last one closes the session.
    countAttempts: jsonb("count_attempts").$type<CashCountAttempt[]>().notNull().default([]),
    closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    // Set when the shift closes.
    cashSales: money("cash_sales"),
    cashRefunds: money("cash_refunds"),
    payIns: money("pay_ins"),
    payOuts: money("pay_outs"),
    expenses: money("expenses"),
    drops: money("drops"),
    cardSales: money("card_sales"),
    transferSales: money("transfer_sales"),
    salesCount: integer("sales_count"),
    expectedCash: money("expected_cash"),
    countedCash: money("counted_cash"),
    closingCounts: jsonb("closing_counts").$type<CashCounts>(),
    // counted - expected: positive = over, negative = short.
    difference: money("difference"),
    // The cashier's explanation of a difference.
    note: text("note"),
    // Cash taken to the safe at closing; the rest stays in the drawer for the next session.
    closingDrop: money("closing_drop"),
    closingBag: text("closing_bag"),
    leftInDrawer: money("left_in_drawer"),
    createdAt: createdAt(),
  },
  (t) => [
    index("cash_shifts_pharmacy_idx").on(t.pharmacyId, t.openedAt),
    index("cash_shifts_branch_idx").on(t.branchId, t.openedAt),
    index("cash_shifts_drawer_idx").on(t.drawerId, t.openedAt),
    uniqueIndex("cash_shifts_one_open_idx")
      .on(t.drawerId)
      .where(sql`${t.closedAt} is null`),
  ],
);

/** Cash put into or taken out of the drawer during a shift, other than sales and refunds. */
export const cashMovements = pgTable(
  "cash_movements",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => cashShifts.id, { onDelete: "cascade" }),
    type: text("type", { enum: CASH_MOVEMENT_TYPES }).notNull(),
    amount: money("amount").notNull(),
    // PAY_IN_CATEGORIES, or PAY_OUT_CATEGORIES for pay-outs recorded before
    // they became expenses; null for drops, no-sales and older rows.
    category: text("category"),
    // Pay-outs: the expense the pay-out was booked as (its category and amount).
    expenseId: uuid("expense_id").references((): AnyPgColumn => expenses.id, {
      onDelete: "set null",
    }),
    reason: text("reason").notNull(),
    // Cash drops: the bag or envelope number and the notes that went in it.
    bagNumber: text("bag_number"),
    counts: jsonb("counts").$type<CashCounts>(),
    // Pay-outs: path of the receipt photo in file storage.
    receiptPath: text("receipt_path"),
    // The manager whose PIN allowed a pay-out over the approval limit.
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("cash_movements_shift_idx").on(t.shiftId, t.createdAt)],
);

/**
 * An item in the manager's review queue (see CASH_REVIEW_KINDS). A pending
 * blocking review keeps its drawer from opening until a manager decides.
 */
export const cashReviews = pgTable(
  "cash_reviews",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    drawerId: uuid("drawer_id")
      .notNull()
      .references(() => cashDrawers.id, { onDelete: "cascade" }),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => cashShifts.id, { onDelete: "cascade" }),
    movementId: uuid("movement_id").references(() => cashMovements.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: CASH_REVIEW_KINDS }).notNull(),
    // Signed difference for counts (negative = short), the amount for a pay-out.
    amount: money("amount").notNull(),
    blocking: boolean("blocking").notNull().default(false),
    // Whose count or pay-out it is.
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status", { enum: CASH_REVIEW_STATUSES }).notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("cash_reviews_pharmacy_status_idx").on(t.pharmacyId, t.status, t.createdAt),
    index("cash_reviews_shift_idx").on(t.shiftId),
    index("cash_reviews_drawer_idx").on(t.drawerId, t.status),
  ],
);

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color", { enum: EXPENSE_COLORS }).notNull().default("teal"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("expense_categories_pharmacy_name_idx").on(t.pharmacyId, t.name)],
);

/** A business cost (rent, salaries, utilities, …) on a calendar day. */
export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    // The branch the cost belongs to; null = the whole business (head office).
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "cascade" }),
    // A category that still has expenses cannot be deleted. NO ACTION rather
    // than RESTRICT: it is checked after the cascade when a pharmacy is deleted.
    categoryId: uuid("category_id")
      .notNull()
      .references(() => expenseCategories.id),
    // YYYY-MM-DD, the pharmacy's own calendar day.
    expenseDate: date("expense_date", { mode: "string" }).notNull(),
    amount: money("amount").notNull(),
    description: text("description").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("expenses_pharmacy_date_idx").on(t.pharmacyId, t.expenseDate),
    index("expenses_category_idx").on(t.categoryId),
  ],
);

/**
 * A customer's regular medicine and when they should come back for more.
 * Customers and products belong to the whole pharmacy, so reminders do too.
 * A sale of the product to the customer moves `nextDueDate` on by
 * `intervalDays` from the day of the sale.
 */
export const refillReminders = pgTable(
  "refill_reminders",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    // How many days one refill lasts.
    intervalDays: integer("interval_days").notNull(),
    // YYYY-MM-DD, the pharmacy's own calendar day.
    nextDueDate: date("next_due_date", { mode: "string" }).notNull(),
    lastRefillDate: date("last_refill_date", { mode: "string" }),
    // Paused reminders are kept but never come due.
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("refill_reminders_pharmacy_due_idx").on(t.pharmacyId, t.nextDueDate),
    uniqueIndex("refill_reminders_customer_product_idx").on(t.customerId, t.productId),
  ],
);

/**
 * A pharmacy's AI settings: its OpenAI API key and which AI features are on.
 * No row means the defaults (no key, every feature on). The key is stored
 * encrypted (src/lib/secrets.ts) and never sent back to the browser.
 */
export const aiSettings = pgTable("ai_settings", {
  pharmacyId: uuid("pharmacy_id")
    .primaryKey()
    .references(() => pharmacies.id, { onDelete: "cascade" }),
  openaiKey: text("openai_key"),
  // Last characters of the key, to show which key is saved.
  openaiKeyHint: text("openai_key_hint"),
  predictionsEnabled: boolean("predictions_enabled").notNull().default(true),
  expiryEnabled: boolean("expiry_enabled").notNull().default(true),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * An alert for the pharmacy (low stock, expiry, subscription). The text is
 * built from `type` and `data` when shown, so it follows the reader's language.
 * `key` names the condition (and, for alerts that repeat, the week), so a scan
 * never creates the same alert twice.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    // Stock alerts belong to a branch; subscription alerts (null) to the whole pharmacy.
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "cascade" }),
    type: text("type", { enum: NOTIFICATION_TYPES }).notNull(),
    key: text("key").notNull(),
    data: jsonb("data").$type<Record<string, string | number | null>>().notNull(),
    // Shared by everyone in the pharmacy; null = unread.
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("notifications_pharmacy_key_idx").on(t.pharmacyId, t.key),
    index("notifications_pharmacy_created_idx").on(t.pharmacyId, t.createdAt),
  ],
);

/** Stock sent from one branch of a pharmacy to another. */
export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    // Human-readable number, e.g. TR-000004 (see nextTransferReference).
    reference: text("reference").notNull(),
    fromBranchId: uuid("from_branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    toBranchId: uuid("to_branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    status: text("status", { enum: TRANSFER_STATUSES }).notNull().default("in_transit"),
    notes: text("notes"),
    sentBy: uuid("sent_by").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    // Set when the transfer is received or cancelled.
    closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("stock_transfers_pharmacy_idx").on(t.pharmacyId, t.sentAt),
    uniqueIndex("stock_transfers_pharmacy_reference_idx").on(t.pharmacyId, t.reference),
  ],
);

/**
 * One batch's worth of a transfer. The batch number, expiry and cost travel
 * with the stock so the receiving branch gets the same batch.
 */
export const stockTransferItems = pgTable(
  "stock_transfer_items",
  {
    id: id(),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => stockTransfers.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    // The sending branch's batch the units came out of (returned to it on cancel).
    sourceBatchId: uuid("source_batch_id").references(() => batches.id, {
      onDelete: "set null",
    }),
    batchNumber: text("batch_number"),
    // YYYY-MM-DD, null = no expiry.
    expiryDate: date("expiry_date", { mode: "string" }),
    quantity: integer("quantity").notNull(),
    costPrice: money("cost_price").notNull().default(0),
  },
  (t) => [index("stock_transfer_items_transfer_idx").on(t.transferId)],
);

/**
 * A full tax receipt (Thai ใบกำกับภาษีเต็มรูป) for a sale, with its own running
 * number and the buyer's details as they were when it was issued. One per sale.
 */
export const taxInvoices = pgTable(
  "tax_invoices",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    buyerName: text("buyer_name").notNull(),
    buyerIdType: text("buyer_id_type", { enum: BUYER_ID_TYPES }).notNull().default("tax_id"),
    // A 13-digit tax ID, or a passport number (buyerIdType).
    buyerTaxId: text("buyer_tax_id").notNull(),
    buyerAddress: text("buyer_address").notNull(),
    // "Head office" (สำนักงานใหญ่) or a branch number.
    buyerBranch: text("buyer_branch"),
    issuedBy: uuid("issued_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("tax_invoices_sale_idx").on(t.saleId),
    uniqueIndex("tax_invoices_pharmacy_number_idx").on(t.pharmacyId, t.number),
    index("tax_invoices_pharmacy_created_idx").on(t.pharmacyId, t.createdAt),
  ],
);

/**
 * A credit note (ใบลดหนี้) cancelling a full tax receipt when its sale is
 * refunded: refunds are whole sales, so it credits the full amount.
 */
export const creditNotes = pgTable(
  "credit_notes",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    taxInvoiceId: uuid("tax_invoice_id")
      .notNull()
      .references(() => taxInvoices.id, { onDelete: "cascade" }),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    reason: text("reason").notNull(),
    issuedBy: uuid("issued_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("credit_notes_tax_invoice_idx").on(t.taxInvoiceId),
    uniqueIndex("credit_notes_pharmacy_number_idx").on(t.pharmacyId, t.number),
  ],
);

/** Photos of a product; one of them is its main photo. Files live in private storage. */
export const productImages = pgTable(
  "product_images",
  {
    id: id(),
    pharmacyId: uuid("pharmacy_id")
      .notNull()
      .references(() => pharmacies.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    isMain: boolean("is_main").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("product_images_product_idx").on(t.productId, t.createdAt),
    // At most one main photo per product.
    uniqueIndex("product_images_one_main_idx")
      .on(t.productId)
      .where(sql`${t.isMain}`),
  ],
);

// ---------------------------------------------------------------------------
// Relations (for db.query.*)
// ---------------------------------------------------------------------------

export const pharmaciesRelations = relations(pharmacies, ({ one, many }) => ({
  plan: one(plans, { fields: [pharmacies.planId], references: [plans.id] }),
  users: many(users),
  branches: many(branches),
}));

export const branchesRelations = relations(branches, ({ one }) => ({
  pharmacy: one(pharmacies, { fields: [branches.pharmacyId], references: [pharmacies.id] }),
}));

export const usersRelations = relations(users, ({ one }) => ({
  pharmacy: one(pharmacies, {
    fields: [users.pharmacyId],
    references: [pharmacies.id],
  }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  batches: many(batches),
}));

export const batchesRelations = relations(batches, ({ one }) => ({
  product: one(products, { fields: [batches.productId], references: [products.id] }),
}));

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [purchases.supplierId],
    references: [suppliers.id],
  }),
  items: many(purchaseItems),
}));

export const purchaseItemsRelations = relations(purchaseItems, ({ one }) => ({
  purchase: one(purchases, {
    fields: [purchaseItems.purchaseId],
    references: [purchases.id],
  }),
  product: one(products, {
    fields: [purchaseItems.productId],
    references: [products.id],
  }),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  customer: one(customers, {
    fields: [sales.customerId],
    references: [customers.id],
  }),
  user: one(users, { fields: [sales.userId], references: [users.id] }),
  items: many(saleItems),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, { fields: [saleItems.saleId], references: [sales.id] }),
  product: one(products, { fields: [saleItems.productId], references: [products.id] }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, {
    fields: [stockMovements.productId],
    references: [products.id],
  }),
  batch: one(batches, { fields: [stockMovements.batchId], references: [batches.id] }),
  user: one(users, { fields: [stockMovements.userId], references: [users.id] }),
}));

export type Plan = typeof plans.$inferSelect;
export type BillingPayment = typeof billingPayments.$inferSelect;
export type Pharmacy = typeof pharmacies.$inferSelect;
export type Branch = typeof branches.$inferSelect;
export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type PurchaseItem = typeof purchaseItems.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type SaleItem = typeof saleItems.$inferSelect;
export type PriceLevel = (typeof PRICE_LEVELS)[number];
export type TaxInvoice = typeof taxInvoices.$inferSelect;
export type CreditNote = typeof creditNotes.$inferSelect;
export type BuyerIdType = (typeof BUYER_ID_TYPES)[number];
export type DocumentSeries = (typeof DOCUMENT_SERIES)[number];
export type ProductImage = typeof productImages.$inferSelect;
export type CashDrawer = typeof cashDrawers.$inferSelect;
export type CashShift = typeof cashShifts.$inferSelect;
export type CashMovement = typeof cashMovements.$inferSelect;
export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];
export type CashReview = typeof cashReviews.$inferSelect;
export type CashReviewKind = (typeof CASH_REVIEW_KINDS)[number];
export type CashReviewStatus = (typeof CASH_REVIEW_STATUSES)[number];
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type ExpenseColor = (typeof EXPENSE_COLORS)[number];
export type Expense = typeof expenses.$inferSelect;
export type RefillReminder = typeof refillReminders.$inferSelect;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type Notification = typeof notifications.$inferSelect;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];
export type StockTransfer = typeof stockTransfers.$inferSelect;
export type StockTransferItem = typeof stockTransferItems.$inferSelect;
