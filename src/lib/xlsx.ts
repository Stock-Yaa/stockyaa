import type { CsvCell } from "./csv";

/*
 * A minimal .xlsx writer: one sheet, text and number cells, a bold header row
 * and optional money columns. An .xlsx file is a zip of a few XML parts; the
 * zip is written uncompressed ("stored"), which every spreadsheet app reads.
 */

const STYLE_HEADER = 1;
const STYLE_MONEY = 2;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
</styleSheet>`;

function xmlEscape(value: string): string {
  return value
    // Control characters other than tab and line breaks are not allowed in XML.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Column letters for a zero-based index: 0 -> A, 26 -> AA. */
function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

function sheetXml(rows: CsvCell[][], moneyColumns: Set<number>): string {
  const widths: number[] = [];
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const text = value === null ? "" : String(value);
          // Money shows thousands separators and two decimals: allow for them.
          const shown = moneyColumns.has(c) && typeof value === "number" ? text.length + 5 : text.length;
          widths[c] = Math.max(widths[c] ?? 8, Math.min(shown + 2, 60));
          if (value === null) return "";
          const ref = `${columnName(c)}${r + 1}`;
          const style =
            r === 0 ? STYLE_HEADER : moneyColumns.has(c) && typeof value === "number" ? STYLE_MONEY : 0;
          const s = style ? ` s="${style}"` : "";
          if (typeof value === "number" && Number.isFinite(value)) {
            return `<c r="${ref}"${s}><v>${value}</v></c>`;
          }
          return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  const cols = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${body}</sheetData>
</worksheet>`;
}

function workbookParts(sheetName: string, sheet: string): [string, string][] {
  // Sheet names: at most 31 characters, none of : \ / ? * [ ].
  const name = xmlEscape(sheetName.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Sheet1");
  return [
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    ],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", sheet],
  ];
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** An uncompressed zip archive of the given files. */
function zip(files: [string, string][]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const entries = files.map(([name, content]) => {
    const data = encoder.encode(content);
    return { name: encoder.encode(name), data, crc: crc32(data) };
  });
  const localSize = entries.reduce((sum, e) => sum + 30 + e.name.length + e.data.length, 0);
  const centralSize = entries.reduce((sum, e) => sum + 46 + e.name.length, 0);
  const out = new Uint8Array(new ArrayBuffer(localSize + centralSize + 22));
  const view = new DataView(out.buffer);
  // 1980-01-01 00:00, the earliest DOS timestamp; the date is irrelevant here.
  const dosTime = 0;
  const dosDate = (1 << 5) | 1;
  const UTF8_NAMES = 0x0800;

  let offset = 0;
  const offsets: number[] = [];
  for (const e of entries) {
    offsets.push(offset);
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, UTF8_NAMES, true);
    view.setUint16(offset + 8, 0, true);
    view.setUint16(offset + 10, dosTime, true);
    view.setUint16(offset + 12, dosDate, true);
    view.setUint32(offset + 14, e.crc, true);
    view.setUint32(offset + 18, e.data.length, true);
    view.setUint32(offset + 22, e.data.length, true);
    view.setUint16(offset + 26, e.name.length, true);
    view.setUint16(offset + 28, 0, true);
    out.set(e.name, offset + 30);
    out.set(e.data, offset + 30 + e.name.length);
    offset += 30 + e.name.length + e.data.length;
  }

  const centralStart = offset;
  entries.forEach((e, i) => {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, UTF8_NAMES, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, dosTime, true);
    view.setUint16(offset + 14, dosDate, true);
    view.setUint32(offset + 16, e.crc, true);
    view.setUint32(offset + 20, e.data.length, true);
    view.setUint32(offset + 24, e.data.length, true);
    view.setUint16(offset + 28, e.name.length, true);
    // Extra field, comment, disk number, attributes: all zero.
    view.setUint32(offset + 42, offsets[i], true);
    out.set(e.name, offset + 46);
    offset += 46 + e.name.length;
  });

  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, offset - centralStart, true);
  view.setUint32(offset + 16, centralStart, true);
  return out;
}

/**
 * A downloadable Excel workbook with one sheet. The first row is the header
 * (bold, frozen); numbers in `moneyColumns` (zero-based) show two decimals.
 * Text cells are never formulas, so no formula neutralising is needed.
 */
export function xlsxResponse(
  filename: string,
  rows: CsvCell[][],
  options: { sheetName?: string; moneyColumns?: number[] } = {},
): Response {
  const sheet = sheetXml(rows, new Set(options.moneyColumns));
  const body = zip(workbookParts(options.sheetName ?? "Sheet1", sheet));
  return new Response(body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
