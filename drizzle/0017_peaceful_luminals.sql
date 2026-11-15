CREATE TABLE "drug_database_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_url" text NOT NULL,
	"counts" jsonb NOT NULL,
	"issues" jsonb NOT NULL,
	"issue_count" integer DEFAULT 0 NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drug_dosing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_row" integer NOT NULL,
	"ingredient" text NOT NULL,
	"route" text NOT NULL,
	"dosage_form" text,
	"patient_group" text,
	"indication_en" text,
	"indication_th" text,
	"dose_basis" text,
	"dose_low" numeric,
	"dose_high" numeric,
	"dose_unit" text,
	"dose_period" text,
	"times_per_day_max" numeric,
	"interval_hours_min" numeric,
	"as_needed" boolean DEFAULT false NOT NULL,
	"max_single_dose" numeric,
	"max_single_dose_unit" text,
	"max_per_day" numeric,
	"max_per_day_unit" text,
	"max_days" numeric,
	"min_age_months" numeric,
	"max_age_months" numeric,
	"min_weight_kg" numeric,
	"max_weight_kg" numeric,
	"timing" text,
	"note_en" text,
	"note_th" text,
	"source" text,
	"version" integer,
	"approved" boolean DEFAULT false NOT NULL,
	"has_errors" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drug_gpu_ingredients" (
	"gpu_id" integer NOT NULL,
	"position" integer NOT NULL,
	"ingredient" text NOT NULL,
	"ingredient_strength" text,
	"route" text,
	"strength_amount" numeric,
	"strength_unit" text,
	"per_amount" numeric,
	"per_unit" text,
	CONSTRAINT "drug_gpu_ingredients_gpu_id_position_pk" PRIMARY KEY("gpu_id","position")
);
--> statement-breakpoint
CREATE TABLE "drug_gpus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gpu_id" integer NOT NULL,
	"sheet_row" integer NOT NULL,
	"gpu_name" text NOT NULL,
	"active_ingredient" text,
	"strength" text,
	"dosage_form" text,
	"route" text,
	"disp_unit" text,
	"combination" boolean DEFAULT false NOT NULL,
	"dose_mode" text,
	"dose_ingredient" text,
	"round_to" numeric,
	"patient_group" text,
	"indication_en" text,
	"indication_th" text,
	"amount_per_dose" numeric,
	"amount_per_dose_max" numeric,
	"amount_unit" text,
	"times_per_day_max" numeric,
	"interval_hours_min" numeric,
	"as_needed" boolean DEFAULT false NOT NULL,
	"max_per_day" numeric,
	"max_per_day_unit" text,
	"max_days" numeric,
	"min_age_months" numeric,
	"max_age_months" numeric,
	"min_weight_kg" numeric,
	"max_weight_kg" numeric,
	"timing" text,
	"warning_label_1" text,
	"warning_label_2" text,
	"warning_label_3" text,
	"note_en" text,
	"note_th" text,
	"version" integer,
	"approved" boolean DEFAULT false NOT NULL,
	"has_errors" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drug_info" (
	"ingredient" text NOT NULL,
	"route" text NOT NULL,
	"name_th" text,
	"drug_class" text,
	"sections" jsonb NOT NULL,
	"source" text,
	"version" integer,
	"approved" boolean DEFAULT false NOT NULL,
	CONSTRAINT "drug_info_ingredient_route_pk" PRIMARY KEY("ingredient","route")
);
--> statement-breakpoint
CREATE TABLE "drug_tmt_products" (
	"tpu_id" integer PRIMARY KEY NOT NULL,
	"gpu_id" integer NOT NULL,
	"trade_name" text NOT NULL,
	"manufacturer" text
);
--> statement-breakpoint
CREATE TABLE "drug_warning_labels" (
	"code" text PRIMARY KEY NOT NULL,
	"text_en" text,
	"text_th" text,
	"version" integer,
	"approved" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drug_database_syncs" ADD CONSTRAINT "drug_database_syncs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drug_dosing_ingredient_idx" ON "drug_dosing" USING btree ("ingredient","route");--> statement-breakpoint
CREATE INDEX "drug_gpus_gpu_idx" ON "drug_gpus" USING btree ("gpu_id");--> statement-breakpoint
CREATE INDEX "drug_tmt_products_gpu_idx" ON "drug_tmt_products" USING btree ("gpu_id");