import { inflateRawSync } from "node:zlib";

/*
 * A minimal .xlsx reader: the cell values of chosen sheets, as text. An .xlsx
 * file is a zip of XML parts; this reads the zip's central directory, inflates
 * the parts it needs and pulls the cells out of the sheet XML. Formulas give
 * their last calculated value; formatting, dates and merged cells are ignored
 * (a date comes back as Excel's serial number).
 */

type ZipEntry = { method: number; compressedSize: number; offset: number };

function readZip(buffer: Buffer): Map<string, ZipEntry> {
  // End of central directory: the last 0x06054b50 record, within 64 KB of the end.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxError("notZip");
  const count = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16);
  const entries = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) throw new XlsxError("notZip");
    const method = buffer.readUInt16LE(p + 10);
    const compressedSize = buffer.readUInt32LE(p + 20);
    const nameLength = buffer.readUInt16LE(p + 28);
    const extraLength = buffer.readUInt16LE(p + 30);
    const commentLength = buffer.readUInt16LE(p + 32);
    const offset = buffer.readUInt32LE(p + 42);
    const name = buffer.toString("utf8", p + 46, p + 46 + nameLength);
    entries.set(name, { method, compressedSize, offset });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntry(buffer: Buffer, entry: ZipEntry): string {
  const p = entry.offset;
  if (buffer.readUInt32LE(p) !== 0x04034b50) throw new XlsxError("notZip");
  const start = p + 30 + buffer.readUInt16LE(p + 26) + buffer.readUInt16LE(p + 28);
  const data = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data.toString("utf8");
  if (entry.method === 8) return inflateRawSync(data).toString("utf8");
  throw new XlsxError("notZip");
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code] ?? match;
  });
}

/** Text of an <si> or <is> element: its <t> runs, without phonetic hints. */
function runText(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of clean.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) {
    out += m[1] ?? "";
  }
  return decode(out);
}

/** "AB" -> 27 (zero-based column index). */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = /\br="(\d+)"/.exec(rowMatch[1]);
    const index = rowNumber ? Number(rowNumber[1]) - 1 : rows.length;
    const cells: string[] = [];
    let next = 0;
    for (const c of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = /\br="([A-Z]+)\d*"/.exec(attrs);
      const col = ref ? columnIndex(ref[1]) : next;
      next = col + 1;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const body = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s") value = v === undefined ? "" : (shared[Number(v)] ?? "");
      else if (type === "inlineStr") value = runText(body);
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (type === "e") value = "";
      else value = v === undefined ? "" : decode(v);
      cells[col] = value;
    }
    rows[index] = Array.from(cells, (v) => v ?? "");
  }
  return Array.from(rows, (r) => r ?? []);
}

export class XlsxError extends Error {
  constructor(readonly code: "notZip" | "noWorkbook") {
    super(code);
  }
}

/** Sheet names of the workbook, in tab order. */
export function readXlsx(buffer: Buffer, wanted?: (name: string) => boolean) {
  const entries = readZip(buffer);
  const part = (name: string) => {
    const entry = entries.get(name);
    return entry ? readEntry(buffer, entry) : null;
  };
  const workbook = part("xl/workbook.xml");
  const rels = part("xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) throw new XlsxError("noWorkbook");

  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && target) {
      targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
    }
  }

  const sharedXml = part("xl/sharedStrings.xml");
  const shared = sharedXml
    ? Array.from(sharedXml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g), (m) => runText(m[1] ?? ""))
    : [];

  const sheets = new Map<string, string[][]>();
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = decode(/\bname="([^"]*)"/.exec(m[1])?.[1] ?? "");
    const rid = /\br:id="([^"]+)"/.exec(m[1])?.[1];
    if (!rid || (wanted && !wanted(name))) continue;
    const xml = part(targets.get(rid) ?? "");
    if (xml !== null) sheets.set(name, parseSheet(xml, shared));
  }
  return sheets;
}
