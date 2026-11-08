ALTER TABLE "pharmacies" ADD COLUMN "invoice_prefix" text DEFAULT 'INV-' NOT NULL;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "invoice_date_format" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "invoice_buddhist_year" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "invoice_digits" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "invoice_seq_period" text DEFAULT '' NOT NULL;