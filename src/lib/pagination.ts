export const PAGE_SIZE = 20;

/** Page number (1-based) from a `?page=` value. */
export function parsePage(value: string | undefined): number {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function pageCountOf(total: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** `%term%` for ILIKE with the wildcard characters in `term` escaped. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
