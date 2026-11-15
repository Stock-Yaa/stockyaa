"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { syncDrugDatabase } from "./actions";

/** The sheet link and the "Sync now" button. */
export function SyncForm({ defaultUrl, tabs }: { defaultUrl: string; tabs: string }) {
  const t = useT();
  const { onSubmit, onChange, pending, errors } = useFormAction(syncDrugDatabase);

  return (
    <form onSubmit={onSubmit} onChange={onChange} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <Field
        label={t("drugDb.sheetLink")}
        htmlFor="drug-sheet-url"
        error={errors.sheetUrl}
        hint={t("drugDb.sheetLinkHint", { tabs })}
        required
        className="min-w-0 flex-1"
      >
        <Input
          id="drug-sheet-url"
          name="sheetUrl"
          type="url"
          defaultValue={defaultUrl}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          aria-invalid={errors.sheetUrl ? true : undefined}
          required
        />
      </Field>
      <Button type="submit" disabled={pending} className="sm:mt-6.5">
        <RefreshCw className={pending ? "animate-spin" : undefined} />
        {pending ? t("drugDb.syncing") : t("drugDb.syncNow")}
      </Button>
    </form>
  );
}
