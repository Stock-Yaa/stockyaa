import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import type { Db } from "@/db";
import {
  drugDatabaseSyncs,
  drugDosing,
  drugGpuIngredients,
  drugGpus,
  drugInfo,
  drugTmtProducts,
  drugWarningLabels,
} from "@/db/schema";
import { DRUG_TABS, parseDrugWorkbook } from "./drug-sheet";
import type { DrugData } from "./dosing";
import { readXlsx } from "./xlsx-read";

/*
 * The platform-wide drug database: a copy of the client's Google Sheet,
 * downloaded and replaced as a whole by the super admin's "Sync now".
 */

/** Tabs read by the sync; the others (Guide, Product lookup, …) are skipped. */
const WANTED_TABS = new Set<string>(Object.values(DRUG_TABS));

const MAX_DOWNLOAD_BYTES = 60 * 1024 * 1024;

export type DownloadErrorCode = "badLink" | "notShared" | "downloadFailed" | "tooLarge" | "notSpreadsheet";

export class DrugDownloadError extends Error {
  constructor(readonly code: DownloadErrorCode) {
    super(code);
  }
}

/** The spreadsheet id in a Google Sheets link, or null. */
export function sheetIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname !== "docs.google.com") return null;
    return /^\/spreadsheets\/d\/([\w-]{20,})/.exec(u.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Downloads the whole workbook as .xlsx. The sheet must be shared as "Anyone
 * with the link can view". Only docs.google.com is ever fetched: the URL is
 * rebuilt from the sheet id, never taken from the user as is.
 */
export async function downloadSheet(sheetId: string): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new DrugDownloadError("downloadFailed");
  }
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new DrugDownloadError("notShared");
  }
  if (!response.ok) throw new DrugDownloadError("downloadFailed");
  if (Number(response.headers.get("content-length")) > MAX_DOWNLOAD_BYTES) {
    throw new DrugDownloadError("tooLarge");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_DOWNLOAD_BYTES) throw new DrugDownloadError("tooLarge");
  // A zip starts with "PK"; a sign-in page or error page does not.
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
    throw new DrugDownloadError("notShared");
  }
  return buffer;
}

/** Reads the workbook's tabs into rows. Throws DrugSheetError or XlsxError. */
export function parseSheetFile(buffer: Buffer) {
  return parseDrugWorkbook(readXlsx(buffer, (name) => WANTED_TABS.has(name)));
}

type Parsed = ReturnType<typeof parseSheetFile>;

/**
 * Insert batches of about 10,000 values. Postgres allows 65,535 parameters per
 * statement, but statements near that size left the embedded PGlite client
 * returning empty results for later queries in the same process.
 */
function chunks<T extends object>(rows: T[]): T[][] {
  if (rows.length === 0) return [];
  const columns = Math.max(1, Object.keys(rows[0]).length);
  const size = Math.max(1, Math.min(1000, Math.floor(10_000 / columns)));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** Replaces the whole drug database in one transaction and logs the sync. */
export async function replaceDrugDatabase(db: Db, parsed: Parsed, sourceUrl: string, userId: string) {
  await db.transaction(async (tx) => {
    // Readers keep seeing the previous copy until this commits.
    await tx.delete(drugTmtProducts);
    await tx.delete(drugGpus);
    await tx.delete(drugGpuIngredients);
    await tx.delete(drugDosing);
    await tx.delete(drugInfo);
    await tx.delete(drugWarningLabels);
    for (const c of chunks(parsed.tmt)) await tx.insert(drugTmtProducts).values(c);
    for (const c of chunks(parsed.gpus)) await tx.insert(drugGpus).values(c);
    for (const c of chunks(parsed.ingredients)) await tx.insert(drugGpuIngredients).values(c);
    for (const c of chunks(parsed.dosing)) await tx.insert(drugDosing).values(c);
    for (const c of chunks(parsed.info)) await tx.insert(drugInfo).values(c);
    for (const c of chunks(parsed.labels)) await tx.insert(drugWarningLabels).values(c);
    await tx.insert(drugDatabaseSyncs).values({
      sourceUrl,
      counts: parsed.counts,
      issues: parsed.issues,
      issueCount: parsed.issueCount,
      userId,
    });
  });
}

export async function latestDrugSync(db: Db) {
  const [row] = await db
    .select()
    .from(drugDatabaseSyncs)
    .orderBy(desc(drugDatabaseSyncs.createdAt))
    .limit(1);
  return row ?? null;
}

export type TmtSearchResult = {
  tpuId: number;
  gpuId: number;
  tradeName: string;
  manufacturer: string | null;
  gpuName: string | null;
  activeIngredient: string | null;
  strength: string | null;
  dosageForm: string | null;
};

/** The GPU columns shown next to a TMT product, by gpu_id. */
async function gpuSummaries(db: Db, gpuIds: number[]) {
  const rows = gpuIds.length
    ? await db
        .selectDistinctOn([drugGpus.gpuId], {
          gpuId: drugGpus.gpuId,
          gpuName: drugGpus.gpuName,
          activeIngredient: drugGpus.activeIngredient,
          strength: drugGpus.strength,
          dosageForm: drugGpus.dosageForm,
        })
        .from(drugGpus)
        .where(inArray(drugGpus.gpuId, [...new Set(gpuIds)]))
        .orderBy(drugGpus.gpuId, drugGpus.sheetRow)
    : [];
  return new Map(rows.map((r) => [r.gpuId, r]));
}

function withGpu(
  products: (typeof drugTmtProducts.$inferSelect)[],
  gpus: Awaited<ReturnType<typeof gpuSummaries>>,
): TmtSearchResult[] {
  return products.map((p) => {
    const g = gpus.get(p.gpuId);
    return {
      ...p,
      gpuName: g?.gpuName ?? null,
      activeIngredient: g?.activeIngredient ?? null,
      strength: g?.strength ?? null,
      dosageForm: g?.dosageForm ?? null,
    };
  });
}

/** TMT products by TPU code, for showing what products are linked to. */
export async function tmtProductsByTpu(db: Db, tpuIds: number[]): Promise<Map<number, TmtSearchResult>> {
  const ids = [...new Set(tpuIds)];
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(drugTmtProducts).where(inArray(drugTmtProducts.tpuId, ids));
  const list = withGpu(rows, await gpuSummaries(db, rows.map((r) => r.gpuId)));
  return new Map(list.map((r) => [r.tpuId, r]));
}

/**
 * TMT products by trade name, or by TPU or GPU code when the query is a
 * number. Trade names that start with the query come first.
 */
export async function searchTmtProducts(db: Db, query: string, limit = 20): Promise<TmtSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const code = /^\d+$/.test(q) ? Number(q) : null;
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const where =
    code !== null && code <= 2_147_483_647
      ? or(eq(drugTmtProducts.tpuId, code), eq(drugTmtProducts.gpuId, code))
      : ilike(drugTmtProducts.tradeName, `%${escaped}%`);
  const rows = await db
    .select()
    .from(drugTmtProducts)
    .where(where)
    .orderBy(asc(drugTmtProducts.tradeName))
    .limit(500);
  const lower = q.toLowerCase();
  const ranked = rows
    .map((r) => ({ r, starts: r.tradeName.toLowerCase().startsWith(lower) ? 0 : 1 }))
    .sort((a, b) => a.starts - b.starts)
    .slice(0, limit)
    .map((x) => x.r);
  return withGpu(ranked, await gpuSummaries(db, ranked.map((r) => r.gpuId)));
}

/** Everything the dose engine needs for one product, or null if the TPU is unknown. */
export async function loadDrugData(db: Db, tpuId: number): Promise<DrugData | null> {
  const [product] = await db.select().from(drugTmtProducts).where(eq(drugTmtProducts.tpuId, tpuId));
  if (!product) return null;
  const [gpuRows, ingredients] = await Promise.all([
    db.select().from(drugGpus).where(eq(drugGpus.gpuId, product.gpuId)),
    db
      .select()
      .from(drugGpuIngredients)
      .where(eq(drugGpuIngredients.gpuId, product.gpuId))
      .orderBy(asc(drugGpuIngredients.position)),
  ]);
  const names = [...new Set(ingredients.map((i) => i.ingredient))];
  const codes = [
    ...new Set(
      gpuRows.flatMap((g) => [g.warningLabel1, g.warningLabel2, g.warningLabel3]).filter((c): c is string => !!c),
    ),
  ];
  const [dosingRows, warningLabels] = await Promise.all([
    names.length
      ? db.select().from(drugDosing).where(inArray(drugDosing.ingredient, names)).orderBy(asc(drugDosing.sheetRow))
      : Promise.resolve([]),
    codes.length
      ? db.select().from(drugWarningLabels).where(inArray(drugWarningLabels.code, codes))
      : Promise.resolve([]),
  ]);
  return { product, gpuRows, ingredients, dosingRows, warningLabels };
}

/** Drug info cards for the product's ingredients by its route. */
export async function loadDrugInfo(db: Db, ingredients: string[], route: string | null) {
  if (ingredients.length === 0 || !route) return [];
  return db
    .select()
    .from(drugInfo)
    .where(and(inArray(drugInfo.ingredient, ingredients), eq(drugInfo.route, route)));
}
