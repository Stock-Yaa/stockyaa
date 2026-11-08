ALTER TABLE "plans" ADD COLUMN "type" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
-- Plans that already allowed several branches become multi-branch plans.
UPDATE "plans" SET "type" = 'multi_branch' WHERE "max_branches" > 1;
