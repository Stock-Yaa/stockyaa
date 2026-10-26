"use client";

import { Printer } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

/** Opens the browser's print dialog; with `auto`, also once when the page loads. */
export function PrintButton({ auto = false }: { auto?: boolean }) {
  const t = useT();
  const printed = useRef(false);

  useEffect(() => {
    if (!auto || printed.current) return;
    printed.current = true;
    // Wait for the web font, otherwise the receipt can print in a fallback face.
    void document.fonts.ready.then(() => window.print());
  }, [auto]);

  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer />
      {t("sales.print")}
    </Button>
  );
}
