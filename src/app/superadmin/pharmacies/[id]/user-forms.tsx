"use client";

import { KeyRound, UserPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { addPharmacyUser, resetUserPassword } from "../actions";

/*
 * Each form lives inside its Modal, which unmounts it on close, so the typed
 * password and any validation errors are gone the next time it opens.
 */

function AddAdminForm({ pharmacyId, onDone }: { pharmacyId: string; onDone: () => void }) {
  const t = useT();
  const { onSubmit, pending, errors } = useFormAction(addPharmacyUser, { onSuccess: onDone });

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <input type="hidden" name="pharmacyId" value={pharmacyId} />
      <Field label={t("common.name")} htmlFor="new-user-name" error={errors.name} required>
        <Input id="new-user-name" name="name" maxLength={100} required autoFocus />
      </Field>
      <Field label={t("common.email")} htmlFor="new-user-email" error={errors.email} required>
        <Input id="new-user-email" name="email" type="email" autoComplete="off" required />
      </Field>
      <Field
        label={t("platform.adminPassword")}
        htmlFor="new-user-password"
        error={errors.password}
        hint={t("platform.passwordHint")}
        required
      >
        <Input
          id="new-user-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>
      <ModalFooter>
        <Button variant="outline" onClick={onDone} disabled={pending}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("common.add")}
        </Button>
      </ModalFooter>
    </form>
  );
}

export function AddAdminButton({ pharmacyId }: { pharmacyId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus />
        {t("platform.addAdmin")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("platform.addAdmin")} size="sm">
        <AddAdminForm pharmacyId={pharmacyId} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function ResetPasswordForm({
  pharmacyId,
  userId,
  onDone,
}: {
  pharmacyId: string;
  userId: string;
  onDone: () => void;
}) {
  const t = useT();
  const { onSubmit, pending, errors } = useFormAction(resetUserPassword, { onSuccess: onDone });

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <input type="hidden" name="pharmacyId" value={pharmacyId} />
      <input type="hidden" name="userId" value={userId} />
      <Field
        label={t("platform.newPassword")}
        htmlFor="reset-password"
        error={errors.password}
        hint={t("platform.passwordHint")}
        required
      >
        <Input
          id="reset-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          autoFocus
        />
      </Field>
      <ModalFooter>
        <Button variant="outline" onClick={onDone} disabled={pending}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("platform.resetPassword")}
        </Button>
      </ModalFooter>
    </form>
  );
}

export function ResetPasswordButton({
  pharmacyId,
  user,
}: {
  pharmacyId: string;
  user: { id: string; name: string };
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("platform.resetPassword")}
        title={t("platform.resetPassword")}
        onClick={() => setOpen(true)}
      >
        <KeyRound />
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("platform.resetPassword")}
        description={t("platform.resetPasswordFor", { name: user.name })}
        size="sm"
      >
        <ResetPasswordForm
          pharmacyId={pharmacyId}
          userId={user.id}
          onDone={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
