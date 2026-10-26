"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { createTranslator, type Messages, type Translate } from "./messages";

const I18nContext = createContext<{ locale: Locale; t: Translate } | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ locale, t: createTranslator(messages) }),
    [locale, messages],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT/useLocale must be used inside <I18nProvider>");
  return ctx;
}

/** Translate function for client components. */
export function useT(): Translate {
  return useI18n().t;
}

export function useLocale(): Locale {
  return useI18n().locale;
}
