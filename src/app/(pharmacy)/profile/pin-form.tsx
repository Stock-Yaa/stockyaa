"use client";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { setOwnPin } from "./actions";

const PIN_INPUT = {
  type: "password",
  inputMode: "numeric",
  autoComplete: "off",
  pattern: "[0-9]{4,6}",
  minLength: 4,
  maxLength: 6,
  required: true,
  className: "text-center text-xl tracking-[0.4em]",
} as const;

/** The signed-in user's own cash drawer PIN. */
export function PinForm() {
  const t = useT();
  const { onSubmit, pending, errors } = useFormAction(setOwnPin, {
    onSuccess: () => (document.getElementById("own-pin-form") as HTMLFormElement | null)?.reset(),
  });
  return (
    <form id="own-pin-form" onSubmit={onSubmit} className="grid gap-4">
      <Field label={t("settings.currentPassword")} htmlFor="pin-password" error={errors.currentPassword} required>
        <Input id="pin-password" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("users.newPin")} htmlFor="own-pin" error={errors.pin} hint={t("users.pinHint")} required>
          <Input id="own-pin" name="pin" {...PIN_INPUT} />
        </Field>
        <Field label={t("users.confirmPin")} htmlFor="own-pin-confirm" error={errors.confirmPin} required>
          <Input id="own-pin-confirm" name="confirmPin" {...PIN_INPUT} />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("users.savePin")}
        </Button>
      </div>
    </form>
  );
}
