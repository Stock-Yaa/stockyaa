import { cookies } from "next/headers";
import { cache } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { createTranslator, getMessages, type Translate } from "./messages";

/** Locale for the current request, from the locale cookie. */
export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

/** Translate function for server components and server actions. */
export const getT = cache(async (): Promise<Translate> => {
  return createTranslator(getMessages(await getLocale()));
});
