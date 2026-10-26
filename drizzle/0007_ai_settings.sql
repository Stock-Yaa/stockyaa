CREATE TABLE "ai_settings" (
	"pharmacy_id" uuid PRIMARY KEY NOT NULL,
	"openai_key" text,
	"openai_key_hint" text,
	"predictions_enabled" boolean DEFAULT true NOT NULL,
	"expiry_enabled" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;