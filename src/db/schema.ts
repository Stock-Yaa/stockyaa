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
} from "drizzle-orm/pg-core";

const money = (name: string) =>
  numeric(name, { precision: 12, scale: 2, mode: "number" });

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const USER_ROLES = ["superadmin", "admin", "staff"] as const;
export const PHARMACY_STATUSES = ["active", "suspended"] as const;
export const SUBSCRIPTION_STATUSES = ["trial", "active", "cancelled"] as const;
export const PURCHASE_STATUSES = ["ordered", "received", "cancelled"] as const;
export const SALE_STATUSES = ["completed", "refunded"] as const;
export const PAYMENT_METHODS = ["cash", "card", "transfer"] as const;
export const BILLING_METHODS = ["cash", "transfer", "stripe"] as const;
export const BILLING_PAYMENT_STATUSES = ["succeeded", "failed", "refunded"] as const;
// "expense" is cash taken out to pay a cost, kept apart from other pay-outs.
export const CASH_MOVEMENT_TYPES = ["in", "out", "expense"] as const;
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
  // How many active branches a pharmacy on this plan may run.
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
  // Percentage added on top of the sale subtotal at the POS (0 = no tax line).
  taxRate: numeric("tax_rate", { precision: 5, scale: 2, mode: "number" })
    .notNull()
    .default(0),
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
  saleSeq: integer("sale_seq").notNull().default(0),
  purchaseSeq: integer("purchase_seq").notNull().default(0),
  transferSeq: integer("transfer_seq").notNull().default(0),
  // Last automatic notification scan, so page loads scan at most every few minutes.
  notificationsScannedAt: timestamp("notifications_scanned_at", { withTimezone: true }),
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
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("branches_pharmacy_name_idx").on(t.pharmacyId, t.name)],
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
    // The one branch a staff member works in. null for admins, who work in
    // every branch, and for super admins.
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
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
    salePrice: money("sale_price").notNull().default(0),
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
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("sales_pharmacy_created_idx").on(t.pharmacyId, t.createdAt),
    index("sales_branch_created_idx").on(t.branchId, t.createdAt),
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

/**
 * A cash drawer shift. At most one is open per branch (closedAt is null).
 * Expected cash = opening balance + cash sales - cash refunds + pay-ins -
 * pay-outs - expenses; the totals are copied in when the shift closes so the history
 * stays the same if a sale is refunded later.
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
    openedBy: uuid("opened_by").references(() => users.id, { onDelete: "set null" }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    openingBalance: money("opening_balance").notNull(),
    closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    // Set when the shift closes.
    cashSales: money("cash_sales"),
    cashRefunds: money("cash_refunds"),
    payIns: money("pay_ins"),
    payOuts: money("pay_outs"),
    expenses: money("expenses"),
    expectedCash: money("expected_cash"),
    countedCash: money("counted_cash"),
    // counted - expected: positive = over, negative = short.
    difference: money("difference"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("cash_shifts_pharmacy_idx").on(t.pharmacyId, t.openedAt),
    index("cash_shifts_branch_idx").on(t.branchId, t.openedAt),
    uniqueIndex("cash_shifts_one_open_idx")
      .on(t.branchId)
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
    reason: text("reason").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("cash_movements_shift_idx").on(t.shiftId, t.createdAt)],
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
export type CashShift = typeof cashShifts.$inferSelect;
export type CashMovement = typeof cashMovements.$inferSelect;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type ExpenseColor = (typeof EXPENSE_COLORS)[number];
export type Expense = typeof expenses.$inferSelect;
export type RefillReminder = typeof refillReminders.$inferSelect;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type Notification = typeof notifications.$inferSelect;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];
export type StockTransfer = typeof stockTransfers.$inferSelect;
export type StockTransferItem = typeof stockTransferItems.$inferSelect;
