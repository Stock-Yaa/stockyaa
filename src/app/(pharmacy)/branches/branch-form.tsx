"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import type { Branch } from "@/db/schema";
import { useT } from "@/i18n/client";
import { saveBranch } from "./actions";

/**
 * "Add branch" button, or a pencil icon when editing, plus the form dialog.
 * `disabled` (with a reason in `title`) when the plan has no branch left.
 */
export function BranchFormButton({
  branch,
  disabled,
  title,
}: {
  branch?: Branch;
  disabled?: boolean;
  title?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { onSubmit, pending, errors } = useFormAction(saveBranch, {
    onSuccess: () => setOpen(false),
  });

  return (
    <>
      {branch ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("common.edit")}
          title={t("common.edit")}
          onClick={() => setOpen(true)}
        >
          <Pencil />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)} disabled={disabled} title={title}>
          <Plus />
          {t("branches.add")}
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={branch ? t("branches.edit") : t("branches.add")}
      >
        <form onSubmit={onSubmit} className="grid gap-4">
          {branch && <input type="hidden" name="id" value={branch.id} />}
          <Field label={t("common.name")} htmlFor="branch-name" error={errors.name} required>
            <Input
              id="branch-name"
              name="name"
              defaultValue={branch?.name}
              maxLength={100}
              required
              autoFocus
            />
          </Field>
          <Field label={t("common.phone")} htmlFor="branch-phone" error={errors.phone}>
            <Input
              id="branch-phone"
              name="phone"
              type="tel"
              maxLength={50}
              defaultValue={branch?.phone ?? ""}
            />
          </Field>
          <Field label={t("common.address")} htmlFor="branch-address" error={errors.address}>
            <Textarea id="branch-address" name="address" defaultValue={branch?.address ?? ""} />
          </Field>
          <Field
            label={t("taxReceipt.sellerBranchCode")}
            htmlFor="branch-tax-code"
            error={errors.taxBranchCode}
            hint={t("taxReceipt.sellerBranchCodeHint")}
          >
            <Input
              id="branch-tax-code"
              name="taxBranchCode"
              inputMode="numeric"
              maxLength={5}
              placeholder="00000"
              defaultValue={branch?.taxBranchCode ?? ""}
              className="tabular-nums"
            />
          </Field>
          <ModalFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("common.saving") : t("common.save")}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
