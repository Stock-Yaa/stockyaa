"use client";

import { ChevronDown, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { useT } from "@/i18n/client";
import { switchBranch } from "@/lib/branch-actions";
import { cn } from "@/lib/utils";
import { useOptionalPharmacy } from "./pharmacy-context";

/**
 * The branch the user is working in, shown in the top bar. Admins of a
 * pharmacy with several branches get a menu to switch; staff see their own.
 * Hidden for an admin whose pharmacy has a single branch.
 */
export function BranchSwitcher() {
  const t = useT();
  const pharmacy = useOptionalPharmacy();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!pharmacy) return null;
  const { branch, branches, canSwitchBranch } = pharmacy;

  if (canSwitchBranch && branches.length < 2) return null;
  if (!canSwitchBranch) {
    return (
      <span className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
        <MapPin className="size-4 shrink-0" />
        <span className="truncate">{branch.name}</span>
      </span>
    );
  }

  function change(id: string) {
    if (id === branch.id) return;
    startTransition(async () => {
      const result = await switchBranch(id);
      if (result?.ok) {
        if (result.message) toast.success(result.message);
        router.refresh();
      } else if (result?.message) {
        toast.error(result.message);
      }
    });
  }

  return (
    <label
      className={cn(
        "relative flex min-w-0 items-center rounded-lg border border-border bg-background text-sm",
        "focus-within:ring-2 focus-within:ring-ring",
        pending && "opacity-60",
      )}
    >
      <span className="sr-only">{t("branches.switchBranch")}</span>
      <MapPin className="pointer-events-none absolute left-2 size-4 text-muted-foreground" />
      <select
        value={branch.id}
        onChange={(e) => change(e.target.value)}
        disabled={pending}
        title={t("branches.switchBranch")}
        className="h-8 max-w-48 min-w-0 cursor-pointer appearance-none truncate rounded-lg bg-transparent pr-7 pl-7 font-medium outline-none"
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 size-4 text-muted-foreground" />
    </label>
  );
}
