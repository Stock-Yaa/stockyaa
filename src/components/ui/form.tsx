import { cn } from "@/lib/utils";

const CONTROL =
  "w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 " +
  "aria-[invalid=true]:border-destructive";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(CONTROL, "h-10", className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(CONTROL, "h-10 pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(CONTROL, "min-h-20 py-2", className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label className={cn("text-sm font-medium text-foreground", className)} {...props} />
  );
}

/** Label + control + optional hint and error message. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
