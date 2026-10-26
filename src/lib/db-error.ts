/*
 * Recognising Postgres constraint errors. Drizzle wraps the driver's error
 * (PGlite or postgres-js) in a DrizzleQueryError, so the SQLSTATE code is on
 * the `cause` rather than on the error that is thrown.
 */

const UNIQUE_VIOLATION = "23505";
// A row is still referenced. Postgres 18 (and the embedded PGlite) reports an
// ON DELETE RESTRICT key as restrict_violation; older servers report the same
// situation as foreign_key_violation.
const STILL_REFERENCED = ["23503", "23001"];

function sqlState(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if ("code" in current && typeof current.code === "string") return current.code;
    current = current.cause;
  }
  return null;
}

export function isUniqueViolation(error: unknown): boolean {
  return sqlState(error) === UNIQUE_VIOLATION;
}

/** True when a delete failed because other rows still point at the record. */
export function isForeignKeyViolation(error: unknown): boolean {
  const code = sqlState(error);
  return code !== null && STILL_REFERENCED.includes(code);
}
