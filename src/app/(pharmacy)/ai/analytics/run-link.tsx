"use client";

import { LoaderCircle, Play } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { buttonClass } from "@/components/ui/button";

/** A primary button-styled link that spins while the analysis loads. */
export function RunLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} prefetch={false} className={buttonClass({ className: "mt-6" })}>
      <RunIcon />
      {label}
    </Link>
  );
}

function RunIcon() {
  const { pending } = useLinkStatus();
  return pending ? <LoaderCircle className="animate-spin" /> : <Play />;
}
