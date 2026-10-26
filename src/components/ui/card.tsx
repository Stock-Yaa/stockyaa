import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-xs",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center justify-between gap-3 px-5 pt-5", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-base font-semibold", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

type Tone = "default" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  default: "bg-accent text-accent-foreground",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/15 text-destructive",
  info: "bg-info/15 text-info",
};

/**
 * Headline number with a label, used on dashboards. With `href` the card is a
 * link (e.g. to a filtered list); `active` marks the view currently shown.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
  active = false,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  href?: string;
  active?: boolean;
}) {
  const body = (
    <>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {Icon && (
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            TONES[tone],
          )}
        >
          <Icon className="size-5" />
        </div>
      )}
    </>
  );
  const className = "flex items-start justify-between gap-3 p-5";
  if (!href) return <Card className={className}>{body}</Card>;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow-xs transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active ? "border-primary ring-1 ring-primary" : "border-border",
        className,
      )}
    >
      {body}
    </Link>
  );
}

export function Badge({
  tone = "default",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: Tone | "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tone === "muted" ? "bg-muted text-muted-foreground" : TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
