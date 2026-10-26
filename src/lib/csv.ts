export type CsvCell = string | number | null;

/** Quotes a CSV cell and neutralises spreadsheet formulas (=, +, -, @). */
function csvCell(value: CsvCell): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** A downloadable CSV file. Starts with a BOM so Excel reads Thai text as UTF-8. */
export function csvResponse(filename: string, rows: CsvCell[][]): Response {
  const body = `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Rows of a CSV file (RFC 4180: quoted cells, "" escapes, line breaks inside
 * quotes). Accepts a leading BOM, CRLF or LF, and a comma, semicolon or tab
 * delimiter, whichever appears first in the header line. Blank lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const headerLine = source.slice(0, source.search(/\r?\n|$/));
  const delimiter = [",", ";", "\t"].find((d) => headerLine.includes(d)) ?? ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
