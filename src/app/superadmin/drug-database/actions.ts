"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { getT } from "@/i18n/server";
import type { ActionState } from "@/lib/action";
import { requireSuperAdmin } from "@/lib/auth";
import {
  DrugDownloadError,
  downloadSheet,
  parseSheetFile,
  replaceDrugDatabase,
  sheetIdFromUrl,
} from "@/lib/drug-database";
import { DrugSheetError } from "@/lib/drug-sheet";
import { XlsxError } from "@/lib/xlsx-read";
import { formString } from "@/lib/utils";

/**
 * Downloads the drug info Google Sheet and replaces the shared drug database
 * with it. Nothing changes unless every step succeeds.
 */
export async function syncDrugDatabase(formData: FormData): Promise<ActionState> {
  const user = await requireSuperAdmin();
  const t = await getT();

  const url = formString(formData, "sheetUrl")?.trim() ?? "";
  const sheetId = sheetIdFromUrl(url);
  if (!sheetId) return { ok: false, fieldErrors: { sheetUrl: t("drugDb.badLink") } };

  let parsed: ReturnType<typeof parseSheetFile>;
  try {
    parsed = parseSheetFile(await downloadSheet(sheetId));
  } catch (err) {
    if (err instanceof DrugDownloadError) return { ok: false, message: t(`drugDb.${err.code}`) };
    if (err instanceof XlsxError) return { ok: false, message: t("drugDb.notSpreadsheet") };
    if (err instanceof DrugSheetError) {
      return { ok: false, message: t(`drugDb.${err.kind}`, { tab: err.tab, column: err.column }) };
    }
    throw err;
  }

  try {
    const db = await getDb();
    await replaceDrugDatabase(db, parsed, `https://docs.google.com/spreadsheets/d/${sheetId}/edit`, user.id);
  } catch (err) {
    console.error("Drug database sync failed", err);
    return { ok: false, message: t("drugDb.saveFailed") };
  }

  revalidatePath("/superadmin/drug-database");
  return {
    ok: true,
    message:
      parsed.issueCount > 0
        ? t("drugDb.syncedWithIssues", { count: parsed.issueCount })
        : t("drugDb.synced", { count: parsed.tmt.length }),
  };
}
