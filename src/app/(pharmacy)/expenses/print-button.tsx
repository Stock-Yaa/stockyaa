"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

/** Opens the browser's print dialog for the filtered expense list. */
export function PrintButton() {
  const t = useT();
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer />
      {t("expenses.print")}
    </Button>
  );
}
