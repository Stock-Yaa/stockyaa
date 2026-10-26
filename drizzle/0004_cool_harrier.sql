CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"type" text NOT NULL,
	"key" text NOT NULL,
	"data" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "notifications_scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_pharmacy_key_idx" ON "notifications" USING btree ("pharmacy_id","key");--> statement-breakpoint
CREATE INDEX "notifications_pharmacy_created_idx" ON "notifications" USING btree ("pharmacy_id","created_at");