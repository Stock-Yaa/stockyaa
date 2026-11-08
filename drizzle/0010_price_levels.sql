ALTER TABLE "customers" ADD COLUMN "price_level" text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "member_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "staff_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "price_level" text DEFAULT 'regular' NOT NULL;