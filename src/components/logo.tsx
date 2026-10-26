import { Pill } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Pill className="size-4.5" />
      </span>
      <span className="text-lg font-semibold tracking-tight">Stockyaa</span>
    </span>
  );
}
