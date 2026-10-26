CREATE TABLE "refill_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"interval_days" integer NOT NULL,
	"next_due_date" date NOT NULL,
	"last_refill_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refill_reminders" ADD CONSTRAINT "refill_reminders_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refill_reminders" ADD CONSTRAINT "refill_reminders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refill_reminders" ADD CONSTRAINT "refill_reminders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refill_reminders_pharmacy_due_idx" ON "refill_reminders" USING btree ("pharmacy_id","next_due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "refill_reminders_customer_product_idx" ON "refill_reminders" USING btree ("customer_id","product_id");