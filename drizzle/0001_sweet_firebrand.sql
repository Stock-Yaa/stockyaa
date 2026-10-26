CREATE TABLE "billing_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid,
	"pharmacy_name" text NOT NULL,
	"plan_id" uuid,
	"plan_name" text,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'succeeded' NOT NULL,
	"months" integer,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"reference" text,
	"note" text,
	"stripe_invoice_id" text,
	"recorded_by" uuid,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "price_yearly" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_payments_paid_idx" ON "billing_payments" USING btree ("paid_at");--> statement-breakpoint
CREATE INDEX "billing_payments_pharmacy_idx" ON "billing_payments" USING btree ("pharmacy_id","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_payments_stripe_invoice_idx" ON "billing_payments" USING btree ("stripe_invoice_id");