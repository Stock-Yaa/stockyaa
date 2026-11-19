CREATE TABLE "dispensed_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"sale_id" uuid,
	"product_id" uuid,
	"user_id" uuid,
	"pharmacist_id" uuid,
	"pharmacist_name" text NOT NULL,
	"pharmacist_license" text NOT NULL,
	"patient_name" text NOT NULL,
	"language" text NOT NULL,
	"preset" text NOT NULL,
	"indication" text NOT NULL,
	"printed" jsonb NOT NULL,
	"thai" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drug_warning_labels" ADD COLUMN "must_print" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "label_preset" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "label_width_mm" integer;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "label_height_mm" integer;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "label_rotate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "label_logo" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pharmacist_license" text;--> statement-breakpoint
ALTER TABLE "dispensed_labels" ADD CONSTRAINT "dispensed_labels_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispensed_labels" ADD CONSTRAINT "dispensed_labels_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispensed_labels" ADD CONSTRAINT "dispensed_labels_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispensed_labels" ADD CONSTRAINT "dispensed_labels_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispensed_labels" ADD CONSTRAINT "dispensed_labels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispensed_labels" ADD CONSTRAINT "dispensed_labels_pharmacist_id_users_id_fk" FOREIGN KEY ("pharmacist_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dispensed_labels_pharmacy_idx" ON "dispensed_labels" USING btree ("pharmacy_id","created_at");--> statement-breakpoint
CREATE INDEX "dispensed_labels_sale_idx" ON "dispensed_labels" USING btree ("sale_id");