"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { usePharmacy } from "@/components/pharmacy-context";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import type { Expense } from "@/db/schema";
import { useT } from "@/i18n/client";
import { MAX_DAY, MIN_DAY } from "@/lib/dates";
import { saveExpense } from "./actions";

export type ExpenseFormValues = Pick<
  Expense,
  "id" | "branchId" | "categoryId" | "expenseDate" | "amount" | "description"
>;

/** "Add expense" button, or a pencil icon when editing, plus the form dialog. */
export function ExpenseFormButton({
  expense,
  categories,
  today,
}: {
  expense?: ExpenseFormValues;
  categories: { id: string; name: string }[];
  /** The pharmacy's calendar day, the default date of a new expense. */
  today: string;
}) {
  const t = useT();
  const { branch, branches, canSwitchBranch } = usePharmacy();
  const [open, setOpen] = useState(false);
  // Admins choose the current branch or the whole business (""); staff always
  // record against their own branch, which the server fills in.
  const branchValue = expense ? (expense.branchId ?? "") : branch.id;
  const { onSubmit, pending, errors } = useFormAction(saveExpense, {
    onSuccess: () => setOpen(false),
  });
  const noCategories = categories.length === 0;

  return (
    <>
      {expense ? (
        <Button
          variant="ghost"
          size="icon"
          className="text-info hover:bg-info/10"
          aria-label={t("common.edit")}
          title={t("common.edit")}
          onClick={() => setOpen(true)}
        >
          <Pencil />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus />
          {t("expenses.add")}
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={expense ? t("expenses.edit") : t("expenses.add")}
      >
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          {expense && <input type="hidden" name="id" value={expense.id} />}
          {noCategories && (
            <p className="rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning sm:col-span-2">
              {t("expenses.needCategory")}
            </p>
          )}
          <Field label={t("expenses.date")} htmlFor="expenseDate" error={errors.expenseDate} required>
            <Input
              id="expenseDate"
              name="expenseDate"
              type="date"
              min={MIN_DAY}
              max={MAX_DAY}
              defaultValue={expense?.expenseDate ?? today}
              required
            />
          </Field>
          <Field label={t("expenses.amount")} htmlFor="amount" error={errors.amount} required>
            <Input
              id="amount"
              name="amount"
              type="number"
              inputMode="decimal"
              min={0.01}
              step="0.01"
              placeholder="0.00"
              defaultValue={expense?.amount}
              required
              className="text-right tabular-nums"
            />
          </Field>
          {canSwitchBranch &&
            (branches.length > 1 ? (
              <Field
                label={t("expenses.branch")}
                htmlFor="branchId"
                error={errors.branchId}
                hint={t("expenses.branchHint")}
                className="sm:col-span-2"
              >
                <Select id="branchId" name="branchId" defaultValue={branchValue}>
                  <option value={branch.id}>{branch.name}</option>
                  <option value="">{t("expenses.wholeBusiness")}</option>
                </Select>
              </Field>
            ) : (
              <input type="hidden" name="branchId" value={branchValue} />
            ))}
          <Field
            label={t("expenses.category")}
            htmlFor="categoryId"
            error={errors.categoryId}
            required
            className="sm:col-span-2"
          >
            <Select
              id="categoryId"
              name="categoryId"
              defaultValue={expense?.categoryId ?? ""}
              disabled={noCategories}
              required
            >
              <option value="" disabled>
                {t("expenses.categoryMissing")}
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("expenses.details")}
            htmlFor="description"
            error={errors.description}
            required
            className="sm:col-span-2"
          >
            <Input
              id="description"
              name="description"
              maxLength={500}
              placeholder={t("expenses.detailsPlaceholder")}
              defaultValue={expense?.description}
              required
            />
          </Field>
          <div className="sm:col-span-2">
            <ModalFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={pending || noCategories}>
                {pending ? t("common.saving") : t("common.save")}
              </Button>
            </ModalFooter>
          </div>
        </form>
      </Modal>
    </>
  );
}
