"use client";

import { Check, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { deleteCategory, saveCategory } from "./actions";

export type CategoryRow = { id: string; name: string; productCount: number };

const NAME_MAX_LENGTH = 100;

/** "Categories" button plus a dialog to add, rename and delete categories. */
export function CategoryManagerButton({ categories }: { categories: CategoryRow[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Tags />
        {t("products.categories")}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("products.manageCategories")}
        description={t("products.manageCategoriesHint")}
      >
        <AddCategoryForm />
        {categories.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {t("products.noCategories")}
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

function AddCategoryForm() {
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const { onSubmit, pending, errors } = useFormAction(saveCategory, {
    onSuccess: () => formRef.current?.reset(),
  });

  return (
    <form ref={formRef} onSubmit={onSubmit}>
      <div className="flex gap-2">
        <Input
          name="name"
          aria-label={t("products.categoryName")}
          aria-invalid={errors.name ? true : undefined}
          placeholder={t("products.newCategoryPlaceholder")}
          maxLength={NAME_MAX_LENGTH}
          required
          autoFocus
        />
        <Button type="submit" disabled={pending}>
          <Plus />
          {t("common.add")}
        </Button>
      </div>
      {errors.name && <p className="mt-1.5 text-xs text-destructive">{errors.name}</p>}
    </form>
  );
}

function CategoryItem({ category }: { category: CategoryRow }) {
  const t = useT();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="px-3 py-2">
        <RenameCategoryForm category={category} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="flex items-center gap-1 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{category.name}</p>
        <p className="text-xs text-muted-foreground">
          {t("products.categoryProductCount", { count: category.productCount })}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("products.renameCategory")}
        onClick={() => setEditing(true)}
      >
        <Pencil />
      </Button>
      <ConfirmButton
        action={() => deleteCategory(category.id)}
        title={t("products.deleteCategoryTitle")}
        body={t("products.deleteCategoryBody")}
        variant="ghost"
        size="icon"
        aria-label={t("common.delete")}
      >
        <Trash2 />
      </ConfirmButton>
    </li>
  );
}

/** Mounted only while renaming, so each attempt starts without old errors. */
function RenameCategoryForm({
  category,
  onDone,
}: {
  category: CategoryRow;
  onDone: () => void;
}) {
  const t = useT();
  const { onSubmit, pending, errors } = useFormAction(saveCategory, { onSuccess: onDone });

  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="id" value={category.id} />
      <div className="flex gap-2">
        <Input
          name="name"
          defaultValue={category.name}
          aria-label={t("products.categoryName")}
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
      {errors.name && <p className="mt-1.5 text-xs text-destructive">{errors.name}</p>}
    </form>
  );
}
