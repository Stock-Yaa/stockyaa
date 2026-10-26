import { cn } from "@/lib/utils";

/** Scrollable table inside a card-like frame. */
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className={cn("w-full text-left text-sm", className)} {...props} />
    </div>
  );
}

export function THead(props: React.ComponentProps<"thead">) {
  return (
    <thead
      className="border-b border-border bg-muted/50 text-xs text-muted-foreground"
      {...props}
    />
  );
}

export function TBody(props: React.ComponentProps<"tbody">) {
  return <tbody className="divide-y divide-border" {...props} />;
}

export function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("hover:bg-muted/40", className)} {...props} />;
}

export function TH({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th className={cn("px-4 py-3 font-medium whitespace-nowrap", className)} {...props} />
  );
}

export function TD({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}
