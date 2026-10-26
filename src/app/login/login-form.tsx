"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { login } from "./actions";

export type DemoAccount = { label: string; email: string; password: string };

export function LoginForm({ demoAccounts }: { demoAccounts: DemoAccount[] }) {
  const t = useT();
  const { onSubmit, pending, state } = useFormAction(login);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function fill(account: DemoAccount) {
    if (emailRef.current) emailRef.current.value = account.email;
    if (passwordRef.current) passwordRef.current.value = account.password;
  }

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t("auth.email")} htmlFor="email">
          <Input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
          />
        </Field>
        <Field label={t("auth.password")} htmlFor="password">
          <Input
            ref={passwordRef}
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        {state && !state.ok && state.message && (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? t("auth.signingIn") : t("auth.signIn")}
        </Button>
      </form>

      {demoAccounts.length > 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-border p-4">
          <p className="text-sm font-medium">{t("auth.demoTitle")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("auth.demoHint")}</p>
          <div className="mt-3 space-y-2">
            {demoAccounts.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => fill(account)}
                className="flex w-full items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="font-medium">{account.label}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {account.email}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
