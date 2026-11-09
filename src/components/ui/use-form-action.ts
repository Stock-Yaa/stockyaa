"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useOptionalPharmacy } from "@/components/pharmacy-context";
import type { ActionState } from "@/lib/action";
import { ACTIVE_BRANCH_FIELD } from "@/lib/active-branch";

/**
 * Wires a <form> to a server action that returns ActionState.
 *
 *   const { onSubmit, pending, errors } = useFormAction(saveSupplier, {
 *     onSuccess: () => setOpen(false),
 *   });
 *   <form onSubmit={onSubmit}> … <Field error={errors.name}> …
 *
 * Shows a toast for the returned message and keeps what the user typed when
 * the action reports an error. Under the pharmacy layout it also sends the
 * branch the page was rendered for, so actions can refuse a form opened in
 * another branch (see branchChanged in src/lib/active-branch.ts).
 */
export function useFormAction(
  action: (formData: FormData) => Promise<ActionState>,
  options: { onSuccess?: (state: NonNullable<ActionState>) => void } = {},
) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const branchId = useOptionalPharmacy()?.branch.id;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (branchId) formData.set(ACTIVE_BRANCH_FIELD, branchId);
    startTransition(async () => {
      const result = await action(formData);
      setState(result);
      if (!result) return;
      if (result.ok) {
        if (result.message) toast.success(result.message);
        options.onSuccess?.(result);
      } else if (result.message) {
        toast.error(result.message);
      }
    });
  }

  /**
   * Put on the <form> as `onChange` to drop a field's error as soon as the
   * user edits that field, instead of keeping it until the next submit.
   */
  function onChange(event: React.FormEvent<HTMLFormElement>) {
    const name = (event.target as { name?: unknown }).name;
    if (typeof name !== "string" || !state?.fieldErrors?.[name]) return;
    const fieldErrors = { ...state.fieldErrors };
    delete fieldErrors[name];
    setState({ ...state, fieldErrors });
  }

  return { onSubmit, onChange, pending, state, errors: state?.fieldErrors ?? {} };
}
