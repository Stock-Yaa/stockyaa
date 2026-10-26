CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reason" text NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"opened_by" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opening_balance" numeric(12, 2) NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"cash_sales" numeric(12, 2),
	"cash_refunds" numeric(12, 2),
	"pay_ins" numeric(12, 2),
	"pay_outs" numeric(12, 2),
	"expenses" numeric(12, 2),
	"expected_cash" numeric(12, 2),
	"counted_cash" numeric(12, 2),
	"difference" numeric(12, 2),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_shift_id_cash_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_movements_shift_idx" ON "cash_movements" USING btree ("shift_id","created_at");--> statement-breakpoint
CREATE INDEX "cash_shifts_pharmacy_idx" ON "cash_shifts" USING btree ("pharmacy_id","opened_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_shifts_one_open_idx" ON "cash_shifts" USING btree ("pharmacy_id") WHERE "cash_shifts"."closed_at" is null;