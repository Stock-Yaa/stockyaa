CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_transfer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"source_batch_id" uuid,
	"batch_number" text,
	"expiry_date" date,
	"quantity" integer NOT NULL,
	"cost_price" numeric(12, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"from_branch_id" uuid NOT NULL,
	"to_branch_id" uuid NOT NULL,
	"status" text DEFAULT 'in_transit' NOT NULL,
	"notes" text,
	"sent_by" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "cash_shifts_one_open_idx";--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "transfer_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "max_branches" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
-- Every existing pharmacy becomes a single branch named after it, and its data moves into that branch.
INSERT INTO "branches" ("pharmacy_id", "name", "address", "phone") SELECT "id", "name", "address", "phone" FROM "pharmacies";--> statement-breakpoint
UPDATE "batches" SET "branch_id" = b."id" FROM "branches" b WHERE b."pharmacy_id" = "batches"."pharmacy_id";--> statement-breakpoint
UPDATE "cash_shifts" SET "branch_id" = b."id" FROM "branches" b WHERE b."pharmacy_id" = "cash_shifts"."pharmacy_id";--> statement-breakpoint
UPDATE "purchases" SET "branch_id" = b."id" FROM "branches" b WHERE b."pharmacy_id" = "purchases"."pharmacy_id";--> statement-breakpoint
UPDATE "sales" SET "branch_id" = b."id" FROM "branches" b WHERE b."pharmacy_id" = "sales"."pharmacy_id";--> statement-breakpoint
UPDATE "stock_movements" SET "branch_id" = b."id" FROM "branches" b WHERE b."pharmacy_id" = "stock_movements"."pharmacy_id";--> statement-breakpoint
UPDATE "users" SET "branch_id" = b."id" FROM "branches" b WHERE b."pharmacy_id" = "users"."pharmacy_id" AND "users"."role" = 'staff';--> statement-breakpoint
ALTER TABLE "batches" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_shifts" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_source_batch_id_batches_id_fk" FOREIGN KEY ("source_batch_id") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_branch_id_branches_id_fk" FOREIGN KEY ("from_branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_branch_id_branches_id_fk" FOREIGN KEY ("to_branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "branches_pharmacy_name_idx" ON "branches" USING btree ("pharmacy_id","name");--> statement-breakpoint
CREATE INDEX "stock_transfer_items_transfer_idx" ON "stock_transfer_items" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "stock_transfers_pharmacy_idx" ON "stock_transfers" USING btree ("pharmacy_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_transfers_pharmacy_reference_idx" ON "stock_transfers" USING btree ("pharmacy_id","reference");--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batches_branch_product_idx" ON "batches" USING btree ("branch_id","product_id");--> statement-breakpoint
CREATE INDEX "cash_shifts_branch_idx" ON "cash_shifts" USING btree ("branch_id","opened_at");--> statement-breakpoint
CREATE INDEX "purchases_branch_idx" ON "purchases" USING btree ("branch_id","ordered_at");--> statement-breakpoint
CREATE INDEX "sales_branch_created_idx" ON "sales" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_branch_idx" ON "stock_movements" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_shifts_one_open_idx" ON "cash_shifts" USING btree ("branch_id") WHERE "cash_shifts"."closed_at" is null;