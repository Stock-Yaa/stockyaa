"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { deletePharmacy } from "../actions";

/** The form unmounts with the Modal, so the typed name is cleared on close. */
function DeleteForm({
  pharmacy,
  onCancel,
}: {
  pharmacy: { id: string; name: string };
  onCancel: () => void;
}) {
  const t = useT();
  const [typed, setTyped] = useState("");
  // On success the action redirects to the pharmacy list, so there is nothing
  // to do here; the server compares the typed name again before deleting.
  const { onSubmit, pending, errors } = useFormAction(deletePharmacy);
  const matches = typed.trim() === pharmacy.name;

  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="id" value={pharmacy.id} />
      <Field
        label={t("platform.deleteConfirmLabel")}
        htmlFor="delete-confirm-name"
        error={errors.confirmName}
        hint={pharmacy.name}
        required
      >
        <Input
          id="delete-confirm-name"
          name="confirmName"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          autoFocus
          required
        />
      </Field>
      <ModalFooter>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" variant="destructive" disabled={!matches || pending}>
          {pending ? t("platform.deleting") : t("platform.deletePermanently")}
        </Button>
      </ModalFooter>
    </form>
  );
}

type DeleteProps = {
  pharmacy: { id: string; name: string };
  /** Translated warning naming the pharmacy and what will be lost. */
  body: string;
};

/** The type-the-name delete dialog, opened by something else (a menu item). */
export function DeletePharmacyDialog({
  pharmacy,
  body,
  open,
  onClose,
}: DeleteProps & { open: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} title={t("platform.deleteModalTitle")} description={body}>
      <DeleteForm pharmacy={pharmacy} onCancel={onClose} />
    </Modal>
  );
}
