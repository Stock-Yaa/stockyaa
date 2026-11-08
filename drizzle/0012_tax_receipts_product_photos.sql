CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"path" text NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"number" text NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_tax_id" text NOT NULL,
	"buyer_address" text NOT NULL,
	"buyer_branch" text,
	"issued_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "tax_branch_code" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "tax_branch" text;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "tax_invoice_prefix" text DEFAULT 'TAX-' NOT NULL;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "tax_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "tax_seq_period" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_one_main_idx" ON "product_images" USING btree ("product_id") WHERE "product_images"."is_main";--> statement-breakpoint
CREATE UNIQUE INDEX "tax_invoices_sale_idx" ON "tax_invoices" USING btree ("sale_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_invoices_pharmacy_number_idx" ON "tax_invoices" USING btree ("pharmacy_id","number");--> statement-breakpoint
CREATE INDEX "tax_invoices_pharmacy_created_idx" ON "tax_invoices" USING btree ("pharmacy_id","created_at");