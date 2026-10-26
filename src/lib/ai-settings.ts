import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { aiSettings } from "@/db/schema";

/** What a pharmacy's AI settings look like to the app; the key itself stays out. */
export type AiSettings = {
  hasKey: boolean;
  /** Last characters of the saved key, e.g. "x7Qa". */
  keyHint: string | null;
  predictionsEnabled: boolean;
  expiryEnabled: boolean;
};

/** A pharmacy's AI settings, or the defaults (no key, every feature on). */
export async function getAiSettings(db: DbOrTx, pharmacyId: string): Promise<AiSettings> {
  const [row] = await db
    .select({
      openaiKey: aiSettings.openaiKey,
      openaiKeyHint: aiSettings.openaiKeyHint,
      predictionsEnabled: aiSettings.predictionsEnabled,
      expiryEnabled: aiSettings.expiryEnabled,
    })
    .from(aiSettings)
    .where(eq(aiSettings.pharmacyId, pharmacyId))
    .limit(1);
  return {
    hasKey: Boolean(row?.openaiKey),
    keyHint: row?.openaiKeyHint ?? null,
    predictionsEnabled: row?.predictionsEnabled ?? true,
    expiryEnabled: row?.expiryEnabled ?? true,
  };
}
