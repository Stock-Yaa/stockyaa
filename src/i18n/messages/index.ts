import type { Locale } from "../config";
import en from "./en";
import th from "./th";

export type Messages = typeof en;

/** "namespace.key", e.g. "common.save". Checked at compile time. */
export type MessageKey = {
  [N in keyof Messages]: `${N & string}.${keyof Messages[N] & string}`;
}[keyof Messages];

export type TranslateVars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: TranslateVars) => string;

const ALL: Record<Locale, Messages> = { en, th };

export function getMessages(locale: Locale): Messages {
  return ALL[locale];
}

/** Builds a translate function. Placeholders look like {name}. */
export function createTranslator(messages: Messages): Translate {
  return (key, vars) => {
    const dot = key.indexOf(".");
    const ns = key.slice(0, dot) as keyof Messages;
    const name = key.slice(dot + 1);
    const template = (messages[ns] as Record<string, string> | undefined)?.[name] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, v: string) =>
      v in vars ? String(vars[v]) : match,
    );
  };
}
