"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { changePassword, updateAccountName } from "@/lib/account-actions";

/** The signed-in user's own name; the sign-in email is shown but not editable. */
export function AccountNameForm({
  name,
  email,
  emailHint,
}: {
  name: string;
  email: string;
  emailHint?: string;
}) {
  const t = useT();
  const { onSubmit, pending, errors } = useFormAction(updateAccountName);

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label={t("settings.yourName")} htmlFor="accountName" error={errors.name} required>
        <Input
          id="accountName"
          name="name"
          defaultValue={name}
          autoComplete="name"
          maxLength={100}
          required
        />
      </Field>
      <Field
        label={t("settings.signInEmail")}
        htmlFor="accountEmail"
        hint={emailHint}
      >
        <Input id="accountEmail" type="email" value={email} readOnly disabled />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const { onSubmit, pending, errors } = useFormAction(changePassword, {
    onSuccess: () => formRef.current?.reset(),
  });

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4">
      <Field
        label={t("settings.currentPassword")}
        htmlFor="currentPassword"
        error={errors.currentPassword}
        required
      >
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Field
        label={t("settings.newPassword")}
        htmlFor="newPassword"
        error={errors.newPassword}
        hint={t("settings.passwordHint")}
        required
      >
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>
      <Field
        label={t("settings.confirmPassword")}
        htmlFor="confirmPassword"
        error={errors.confirmPassword}
        required
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("settings.changePassword")}
        </Button>
      </div>
    </form>
  );
}
