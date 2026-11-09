CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"tax_invoice_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"number" text NOT NULL,
	"reason" text NOT NULL,
	"issued_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_counters" (
	"pharmacy_id" uuid NOT NULL,
	"series" text NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"period" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pharmacies" ALTER COLUMN "tax_rate" SET DEFAULT 7;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "expense_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "tax_id_type" text DEFAULT 'tax_id' NOT NULL;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "vat_registered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "member_discount" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "staff_discount" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "credit_note_prefix" text DEFAULT 'CN-' NOT NULL;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "purchase_prefix" text DEFAULT 'PO-' NOT NULL;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "transfer_prefix" text DEFAULT 'TR-' NOT NULL;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "number_per_branch" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "tax_included" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "buyer_id_type" text DEFAULT 'tax_id' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_tax_invoice_id_tax_invoices_id_fk" FOREIGN KEY ("tax_invoice_id") REFERENCES "public"."tax_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_tax_invoice_idx" ON "credit_notes" USING btree ("tax_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_pharmacy_number_idx" ON "credit_notes" USING btree ("pharmacy_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "document_counters_key_idx" ON "document_counters" USING btree ("pharmacy_id","series","scope");--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "branches_pharmacy_code_idx" ON "branches" USING btree ("pharmacy_id","code");--> statement-breakpoint
-- Pharmacies that charged VAT stay VAT-registered; the rate of the others becomes the usual 7%, used once they register.
UPDATE "pharmacies" SET "vat_registered" = ("tax_rate" > 0);--> statement-breakpoint
UPDATE "pharmacies" SET "tax_rate" = 7 WHERE "tax_rate" = 0;--> statement-breakpoint
-- Earlier sales added their VAT on top of the price.
UPDATE "sales" SET "tax_included" = false WHERE "tax" <> 0;--> statement-breakpoint
-- The counters move from pharmacies to document_counters (whole pharmacy: scope '').
INSERT INTO "document_counters" ("pharmacy_id", "series", "scope", "seq", "period")
SELECT "id", 'sale', '', "sale_seq", "invoice_seq_period" FROM "pharmacies"
UNION ALL SELECT "id", 'tax', '', "tax_seq", "tax_seq_period" FROM "pharmacies"
UNION ALL SELECT "id", 'purchase', '', "purchase_seq", '' FROM "pharmacies"
UNION ALL SELECT "id", 'transfer', '', "transfer_seq", '' FROM "pharmacies";
