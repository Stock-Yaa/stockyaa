"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/** Re-renders the current server page with fresh data; the icon spins meanwhile. */
export function RefreshButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button onClick={() => startTransition(() => router.refresh())} disabled={pending}>
      <RefreshCw className={cn(pending && "animate-spin")} />
      {label}
    </Button>
  );
}
