"use client";

import { Printer } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

/** Opens the print dialog once the page and its font are ready, and on click. */
export function PrintNow() {
  const t = useT();
  const printed = useRef(false);
  useEffect(() => {
    if (printed.current) return;
    printed.current = true;
    void document.fonts.ready.then(() => window.print());
  }, []);
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer />
      {t("sales.print")}
    </Button>
  );
}
