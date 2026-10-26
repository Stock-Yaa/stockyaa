import type { Metadata } from "next";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";

/**
 * Translated browser-tab title for a page:
 *   export const generateMetadata = pageTitle("suppliers.title");
 */
export function pageTitle(key: MessageKey) {
  return async function generateMetadata(): Promise<Metadata> {
    const t = await getT();
    return { title: t(key) };
  };
}
