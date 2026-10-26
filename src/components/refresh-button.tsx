"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** Reloads the server data of the current page without a full page reload. */
export function RefreshButton() {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
    >
      <RefreshCw className={cn(pending && "animate-spin")} />
      {t("billing.refresh")}
    </Button>
  );
}
