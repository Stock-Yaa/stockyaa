"use client";

import { Check, Pencil, Plus, Settings, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import { EXPENSE_COLORS, type ExpenseColor } from "@/db/schema";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { deleteExpenseCategory, saveExpenseCategory } from "./actions";
import { EXPENSE_COLOR_DOT, EXPENSE_COLOR_LABEL } from "./colors";

export type ExpenseCategoryRow = {
  id: string;
  name: string;
  color: ExpenseColor;
  expenseCount: number;
};

const NAME_MAX_LENGTH = 100;

/** "Categories" button plus a dialog to add, edit and delete expense categories. */
export function ExpenseCategoryManagerButton({
  categories,
}: {
  categories: ExpenseCategoryRow[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Suggest the first colour no category uses yet.
  const used = new Set(categories.map((c) => c.color));
  const nextColor =
    EXPENSE_COLORS.find((c) => !used.has(c)) ??
    EXPENSE_COLORS[categories.length % EXPENSE_COLORS.length];

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Settings />
        {t("expenses.categories")}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("expenses.manageCategories")}
        description={t("expenses.manageCategoriesHint")}
      >
        {/* Remounted after each add, which clears the form and picks the next colour. */}
        <AddCategoryForm key={categories.length} defaultColor={nextColor} />
        {categories.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {t("expenses.noCategories")}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {categories.map((category) => (
              <CategoryItem key={category.id} category={category} />
            ))}
          </ul>
        )}
        <ModalFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.close")}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

/** Row of colour swatches as radio buttons named `color`. */
function ColorPicker({ defaultValue }: { defaultValue: ExpenseColor }) {
  const t = useT();
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="sr-only">{t("expenses.color")}</legend>
      {EXPENSE_COLORS.map((color) => (
        <label key={color} title={t(EXPENSE_COLOR_LABEL[color])} className="cursor-pointer">
          <input
            type="radio"
            name="color"
            value={color}
            defaultChecked={color === defaultValue}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className={cn(
              "block size-5 rounded-full ring-offset-2 ring-offset-card transition-shadow",
              "peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
              EXPENSE_COLOR_DOT[color],
            )}
          />
          <span className="sr-only">{t(EXPENSE_COLOR_LABEL[color])}</span>
        </label>
      ))}
    </fieldset>
  );
}

function AddCategoryForm({ defaultColor }: { defaultColor: ExpenseColor }) {
  const t = useT();
  const { onSubmit, pending, errors } = useFormAction(saveExpenseCategory);

  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      <div className="flex gap-2">
        <Input
          name="name"
          aria-label={t("expenses.categoryName")}
          aria-invalid={errors.name ? true : undefined}
          placeholder={t("expenses.newCategoryPlaceholder")}
          maxLength={NAME_MAX_LENGTH}
          required
          autoFocus
        />
        <Button type="submit" disabled={pending}>
          <Plus />
          {t("common.add")}
        </Button>
      </div>
      <ColorPicker defaultValue={defaultColor} />
      {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
    </form>
  );
}

function CategoryItem({ category }: { category: ExpenseCategoryRow }) {
  const t = useT();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="px-3 py-2">
        <EditCategoryForm category={category} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <span
        aria-hidden
        className={cn("size-2.5 shrink-0 rounded-full", EXPENSE_COLOR_DOT[category.color])}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{category.name}</p>
        <p className="text-xs text-muted-foreground">
          {t("expenses.categoryExpenseCount", { count: category.expenseCount })}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("expenses.editCategory")}
        title={t("expenses.editCategory")}
        onClick={() => setEditing(true)}
      >
        <Pencil />
      </Button>
      <ConfirmButton
        action={() => deleteExpenseCategory(category.id)}
        title={t("expenses.deleteCategoryTitle")}
        variant="ghost"
        size="icon"
        aria-label={t("common.delete")}
        disabled={category.expenseCount > 0}
      >
        <Trash2 />
      </ConfirmButton>
    </li>
  );
}

/** Mounted only while editing, so each attempt starts without old errors. */
function EditCategoryForm({
  category,
  onDone,
}: {
  category: ExpenseCategoryRow;
  onDone: () => void;
}) {
  const t = useT();
  const { onSubmit, pending, errors } = useFormAction(saveExpenseCategory, {
    onSuccess: onDone,
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      <input type="hidden" name="id" value={category.id} />
      <div className="flex gap-2">
        <Input
          name="name"
          defaultValue={category.name}
          aria-label={t("expenses.categoryName")}
          aria-invalid={errors.name ? true : undefined}
          maxLength={NAME_MAX_LENGTH}
          required
          autoFocus
        />
        <Button
          type="submit"
          size="icon"
          className="size-10"
          aria-label={t("common.save")}
          disabled={pending}
        >
          <Check />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-10"
          aria-label={t("common.cancel")}
          onClick={onDone}
          disabled={pending}
        >
          <X />
        </Button>
      </div>
      <ColorPicker defaultValue={category.color} />
      {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
    </form>
  );
}
