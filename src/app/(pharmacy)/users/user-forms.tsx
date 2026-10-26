"use client";

import { KeyRound, Pencil, UserPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { resetPassword, saveUser } from "./actions";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  branchId: string | null;
};

export type BranchOption = { id: string; name: string };

/*
 * Each form lives inside its Modal, which unmounts it on close, so a typed
 * password and any validation errors are gone the next time it opens.
 */

function UserForm({
  user,
  branches,
  defaultBranchId,
  isSelf,
  onDone,
}: {
  user?: UserRow;
  branches: BranchOption[];
  defaultBranchId: string;
  isSelf: boolean;
  onDone: () => void;
}) {
  const t = useT();
  const { onSubmit, pending, errors } = useFormAction(saveUser, { onSuccess: onDone });
  const [role, setRole] = useState<UserRow["role"]>(user?.role ?? "staff");

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {user && <input type="hidden" name="id" value={user.id} />}
      <Field label={t("common.name")} htmlFor="user-name" error={errors.name} required>
        <Input
          id="user-name"
          name="name"
          defaultValue={user?.name}
          maxLength={100}
          required
          autoFocus
        />
      </Field>
      <Field label={t("common.email")} htmlFor="user-email" error={errors.email} required>
        <Input
          id="user-email"
          name="email"
          type="email"
          autoComplete="off"
          defaultValue={user?.email}
          required
        />
      </Field>
      <Field
        label={t("users.role")}
        htmlFor="user-role"
        error={errors.role}
        hint={isSelf ? t("users.notYourself") : t("users.roleHint")}
        required
      >
        {/* A disabled select is not submitted, so the role travels in a hidden field. */}
        {isSelf && <input type="hidden" name="role" value={role} />}
        <Select
          id="user-role"
          name={isSelf ? undefined : "role"}
          value={role}
          onChange={(e) => setRole(e.target.value as UserRow["role"])}
          disabled={isSelf}
        >
          <option value="staff">{t("users.roleStaff")}</option>
          <option value="admin">{t("users.roleAdmin")}</option>
        </Select>
      </Field>
      {role === "staff" && (
        <Field
          label={t("users.branch")}
          htmlFor="user-branch"
          error={errors.branchId}
          hint={t("users.branchHint")}
          required
        >
          <Select
            id="user-branch"
            name="branchId"
            defaultValue={user?.branchId ?? defaultBranchId}
            required
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {!user && (
        <Field
          label={t("users.password")}
          htmlFor="user-password"
          error={errors.password}
          hint={t("users.passwordHint")}
          required
        >
          <Input
            id="user-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
      )}
      <ModalFooter>
        <Button variant="outline" onClick={onDone} disabled={pending}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("common.save")}
        </Button>
      </ModalFooter>
    </form>
  );
}

/** "Add user" button, or a pencil icon when editing, plus the form dialog. */
export function UserFormButton({
  user,
  branches,
  defaultBranchId,
  isSelf = false,
}: {
  user?: UserRow;
  /** Active branches a staff member can be assigned to. */
  branches: BranchOption[];
  defaultBranchId: string;
  isSelf?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      {user ? (
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
        <Button onClick={() => setOpen(true)}>
          <UserPlus />
          {t("users.add")}
        </Button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={user ? t("users.edit") : t("users.add")}
        size="sm"
      >
        <UserForm
          user={user}
          branches={branches}
          defaultBranchId={defaultBranchId}
          isSelf={isSelf}
          onDone={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}

function ResetPasswordForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const t = useT();
  const { onSubmit, pending, errors } = useFormAction(resetPassword, { onSuccess: onDone });

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <input type="hidden" name="userId" value={userId} />
      <Field
        label={t("users.newPassword")}
        htmlFor="reset-password"
        error={errors.password}
        hint={t("users.passwordHint")}
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
          {pending ? t("common.saving") : t("users.resetPassword")}
        </Button>
      </ModalFooter>
    </form>
  );
}

export function ResetPasswordButton({ user }: { user: { id: string; name: string } }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("users.resetPassword")}
        title={t("users.resetPassword")}
        onClick={() => setOpen(true)}
      >
        <KeyRound />
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("users.resetPassword")}
        description={t("users.resetPasswordFor", { name: user.name })}
        size="sm"
      >
        <ResetPasswordForm userId={user.id} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
