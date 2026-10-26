import type { ZodError } from "zod";

/**
 * Result shape for server actions used with useActionState.
 * `message` is already translated; `fieldErrors` maps input name -> message.
 */
export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
} | null;

/** First error per field from a zod error, with messages passed through `translate`. */
export function fieldErrorsFrom(
  error: ZodError,
  translate: (message: string) => string = (m) => m,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !(key in out)) out[key] = translate(issue.message);
  }
  return out;
}
