CREATE TABLE "cash_drawers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"float_amount" numeric(12, 2) DEFAULT 2000 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"drawer_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"movement_id" uuid,
	"kind" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"blocking" boolean DEFAULT false NOT NULL,
	"user_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "cash_shifts_one_open_idx";--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "bag_number" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "counts" jsonb;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "receipt_path" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD COLUMN "drawer_id" uuid;--> statement-breakpoint
-- Until now each branch had one drawer: give every branch with shifts a
-- "Drawer 1" and move its shifts onto it. Other branches get theirs on first use.
INSERT INTO "cash_drawers" ("pharmacy_id", "branch_id", "name")
SELECT DISTINCT s."pharmacy_id", s."branch_id", 'Drawer 1' FROM "cash_shifts" s;--> statement-breakpoint
UPDATE "cash_shifts" s SET "drawer_id" = d."id"
FROM "cash_drawers" d WHERE d."branch_id" = s."branch_id";--> statement-breakpoint
ALTER TABLE "cash_shifts" ALTER COLUMN "drawer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD COLUMN "opening_counts" jsonb;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD COLUMN "previous_shift_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD COLUMN "expected_opening" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD COLUMN "count_attempts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD COLUMN "drops" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD COLUMN "card_sales" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD COLUMN "transfer_sales" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD COLUMN "sales_count" integer;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD COLUMN "closing_counts" jsonb;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD COLUMN "closing_drop" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD COLUMN "closing_bag" text;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD COLUMN "left_in_drawer" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "cash_minor_tolerance" numeric(12, 2) DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "cash_major_tolerance" numeric(12, 2) DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "payout_approval_limit" numeric(12, 2) DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "cash_recounts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "shift_id" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "refund_shift_id" uuid;--> statement-breakpoint
-- Sales were counted into the branch's shift by time: link each to the shift
-- that was open when it was made, and each refund to the one open when it was refunded.
UPDATE "sales" x SET "shift_id" = s."id" FROM "cash_shifts" s
WHERE s."branch_id" = x."branch_id" AND x."created_at" >= s."opened_at"
  AND (s."closed_at" IS NULL OR x."created_at" < s."closed_at");--> statement-breakpoint
UPDATE "sales" x SET "refund_shift_id" = s."id" FROM "cash_shifts" s
WHERE x."refunded_at" IS NOT NULL AND s."branch_id" = x."branch_id" AND x."refunded_at" >= s."opened_at"
  AND (s."closed_at" IS NULL OR x."refunded_at" < s."closed_at");--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pin_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pin_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pin_locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cash_drawers" ADD CONSTRAINT "cash_drawers_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawers" ADD CONSTRAINT "cash_drawers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_reviews" ADD CONSTRAINT "cash_reviews_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_reviews" ADD CONSTRAINT "cash_reviews_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_reviews" ADD CONSTRAINT "cash_reviews_drawer_id_cash_drawers_id_fk" FOREIGN KEY ("drawer_id") REFERENCES "public"."cash_drawers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_reviews" ADD CONSTRAINT "cash_reviews_shift_id_cash_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_reviews" ADD CONSTRAINT "cash_reviews_movement_id_cash_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."cash_movements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_reviews" ADD CONSTRAINT "cash_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_reviews" ADD CONSTRAINT "cash_reviews_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_drawers_branch_name_idx" ON "cash_drawers" USING btree ("branch_id","name");--> statement-breakpoint
CREATE INDEX "cash_reviews_pharmacy_status_idx" ON "cash_reviews" USING btree ("pharmacy_id","status","created_at");--> statement-breakpoint
CREATE INDEX "cash_reviews_shift_idx" ON "cash_reviews" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "cash_reviews_drawer_idx" ON "cash_reviews" USING btree ("drawer_id","status");--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_drawer_id_cash_drawers_id_fk" FOREIGN KEY ("drawer_id") REFERENCES "public"."cash_drawers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_shift_id_cash_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_refund_shift_id_cash_shifts_id_fk" FOREIGN KEY ("refund_shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_shifts_drawer_idx" ON "cash_shifts" USING btree ("drawer_id","opened_at");--> statement-breakpoint
CREATE INDEX "sales_shift_idx" ON "sales" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "sales_refund_shift_idx" ON "sales" USING btree ("refund_shift_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_shifts_one_open_idx" ON "cash_shifts" USING btree ("drawer_id") WHERE "cash_shifts"."closed_at" is null;