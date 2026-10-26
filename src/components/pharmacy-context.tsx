"use client";

import { createContext, useContext, useMemo } from "react";
import { useLocale } from "@/i18n/client";
import { createFormat, type Format } from "@/lib/format";

export type PharmacyInfo = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  taxRate: number;
  /** The branch the user is working in. */
  branch: { id: string; name: string };
  /** Branches the user may switch to (only their own for staff). */
  branches: { id: string; name: string }[];
  /** Admins work in every branch; staff in one. */
  canSwitchBranch: boolean;
};

const PharmacyContext = createContext<PharmacyInfo | null>(null);

export function PharmacyProvider({
  value,
  children,
}: {
  value: PharmacyInfo;
  children: React.ReactNode;
}) {
  return <PharmacyContext.Provider value={value}>{children}</PharmacyContext.Provider>;
}

/** The current pharmacy. Only available under the pharmacy layout. */
export function usePharmacy(): PharmacyInfo {
  const ctx = useContext(PharmacyContext);
  if (!ctx) throw new Error("usePharmacy must be used inside the pharmacy layout");
  return ctx;
}

/** The current pharmacy, or null outside the pharmacy layout. */
export function useOptionalPharmacy(): PharmacyInfo | null {
  return useContext(PharmacyContext);
}

/**
 * Formatters for client components. Uses the currency and timezone of the
 * current pharmacy when rendered under the pharmacy layout; pass `currency`
 * to override.
 */
export function useFormat(currency?: string): Format {
  const locale = useLocale();
  const pharmacy = useContext(PharmacyContext);
  return useMemo(
    () => createFormat(locale, currency ?? pharmacy?.currency, pharmacy?.timezone),
    [locale, currency, pharmacy?.currency, pharmacy?.timezone],
  );
}
