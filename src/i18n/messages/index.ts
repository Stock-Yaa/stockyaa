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

/** True when the message's number (`count`, else `days`) is exactly 1. */
function isOne(vars: TranslateVars): boolean {
  const n = "count" in vars ? vars.count : vars.days;
  return n !== undefined && String(n).trim() === "1";
}

/**
 * Builds a translate function. Placeholders look like {name}. When the
 * message's number is 1 and a `<key>One` message exists, that one is used:
 * "1 sale", not "1 sales".
 */
export function createTranslator(messages: Messages): Translate {
  return (key, vars) => {
    const dot = key.indexOf(".");
    const ns = key.slice(0, dot) as keyof Messages;
    const name = key.slice(dot + 1);
    const table = messages[ns] as Record<string, string> | undefined;
    const singular = vars && isOne(vars) ? table?.[`${name}One`] : undefined;
    const template = singular ?? table?.[name] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, v: string) =>
      v in vars ? String(vars[v]) : match,
    );
  };
}
