"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { aiSettings } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { canSwitchBranch } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { MissingEncryptionSecretError, decryptSecret, encryptSecret } from "@/lib/secrets";
import { checkbox, formToObject } from "@/lib/validation";

// OpenAI secret keys: "sk-…" or project keys "sk-proj-…".
const KEY_PATTERN = /^sk-[A-Za-z0-9_-]{20,300}$/;
const TEST_TIMEOUT_MS = 10_000;

const openaiKey = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z.string().regex(KEY_PATTERN, "aiSettings.invalidKey"),
);

const settingsSchema = z.object({
  // Blank keeps the saved key.
  openaiKey: z.preprocess((v) => (v === "" ? undefined : v), openaiKey.optional()),
  predictionsEnabled: checkbox,
  expiryEnabled: checkbox,
});

/** Only pharmacy admins manage the AI settings. */
async function requireAdmin() {
  const ctx = await requirePharmacy();
  return canSwitchBranch(ctx.user) ? ctx : null;
}

export async function saveAiSettings(formData: FormData): Promise<ActionState> {
  const t = await getT();
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, message: t("aiSettings.adminOnly") };

  const parsed = settingsSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)) };
  }
  const { openaiKey: key, ...features } = parsed.data;

  let keyFields = {};
  if (key) {
    try {
      keyFields = { openaiKey: encryptSecret(key), openaiKeyHint: key.slice(-4) };
    } catch (error) {
      if (error instanceof MissingEncryptionSecretError) {
        return { ok: false, message: t("aiSettings.noEncryptionSecret") };
      }
      throw error;
    }
  }

  const values = { ...features, ...keyFields, updatedBy: ctx.user.id, updatedAt: new Date() };
  const db = await getDb();
  await db
    .insert(aiSettings)
    .values({ pharmacyId: ctx.pharmacy.id, ...values })
    .onConflictDoUpdate({ target: aiSettings.pharmacyId, set: values });

  revalidatePath("/ai", "layout");
  return { ok: true, message: t("aiSettings.saved") };
}

export async function removeAiKey(): Promise<ActionState> {
  const t = await getT();
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, message: t("aiSettings.adminOnly") };
  const db = await getDb();
  await db
    .update(aiSettings)
    .set({ openaiKey: null, openaiKeyHint: null, updatedBy: ctx.user.id, updatedAt: new Date() })
    .where(eq(aiSettings.pharmacyId, ctx.pharmacy.id));
  revalidatePath("/ai", "layout");
  return { ok: true, message: t("aiSettings.keyRemoved") };
}

/**
 * Checks a key against OpenAI by listing the models it can use. Tests the key
 * typed in the form, or the saved one when the field is blank. Nothing is saved.
 */
export async function testAiKey(typed: string): Promise<ActionState> {
  const t = await getT();
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, message: t("aiSettings.adminOnly") };

  let key: string | null;
  if (typed.trim()) {
    const parsed = openaiKey.safeParse(typed);
    if (!parsed.success) return { ok: false, message: t("aiSettings.invalidKey") };
    key = parsed.data;
  } else {
    const db = await getDb();
    const [row] = await db
      .select({ openaiKey: aiSettings.openaiKey })
      .from(aiSettings)
      .where(eq(aiSettings.pharmacyId, ctx.pharmacy.id))
      .limit(1);
    if (!row?.openaiKey) return { ok: false, message: t("aiSettings.enterKeyFirst") };
    key = decryptSecret(row.openaiKey);
    if (!key) return { ok: false, message: t("aiSettings.keyUnreadable") };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (response.ok) return { ok: true, message: t("aiSettings.testOk") };
    if (response.status === 401) return { ok: false, message: t("aiSettings.testUnauthorized") };
    // The key was accepted but the account is out of quota or rate limited.
    if (response.status === 429) return { ok: false, message: t("aiSettings.testQuota") };
    return { ok: false, message: t("aiSettings.testFailed", { status: response.status }) };
  } catch {
    return { ok: false, message: t("aiSettings.testUnreachable") };
  }
}
