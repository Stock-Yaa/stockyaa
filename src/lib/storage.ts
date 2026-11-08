import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/*
 * Private file storage for receipt photos. In production files go to a
 * private Supabase Storage bucket through its REST API (SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY); the app reads them back with the same key and
 * serves them only to signed-in users of the pharmacy. Without that
 * configuration, development stores them in ./.uploads.
 */

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "stockyaa-private";
const LOCAL_DIR = path.join(process.cwd(), ".uploads");

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("File storage is not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  }
}

function supabase() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  // New "sb_secret_…" keys go in the apikey header only; legacy service_role
  // JWTs also as the bearer token.
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`;
  return { url, headers };
}

/** True when files can be stored here (Supabase configured, or local development). */
export function storageAvailable(): boolean {
  return supabase() !== null || process.env.NODE_ENV !== "production";
}

const objectUrl = (base: string, key: string) =>
  `${base}/storage/v1/object/${BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;

async function createBucket(base: string, headers: Record<string, string>) {
  const response = await fetch(`${base}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
  // 409/400 "already exists" is fine.
  if (!response.ok && response.status !== 409 && response.status !== 400) {
    throw new Error(`Could not create storage bucket (${response.status})`);
  }
}

/** Stores a file under `key` (e.g. "<pharmacyId>/receipts/<uuid>.jpg"). */
export async function putFile(key: string, body: Uint8Array, contentType: string): Promise<void> {
  const remote = supabase();
  if (!remote) {
    if (process.env.NODE_ENV === "production") throw new StorageNotConfiguredError();
    const file = path.join(LOCAL_DIR, ...key.split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return;
  }
  const upload = () =>
    fetch(objectUrl(remote.url, key), {
      method: "POST",
      headers: { ...remote.headers, "Content-Type": contentType, "x-upsert": "false" },
      body: Buffer.from(body),
    });
  let response = await upload();
  if (!response.ok && (response.status === 404 || response.status === 400)) {
    const text = await response.text();
    // The bucket is made on first use.
    if (/bucket/i.test(text) && /not.?found/i.test(text)) {
      await createBucket(remote.url, remote.headers);
      response = await upload();
    } else {
      throw new Error(`Upload failed (${response.status}): ${text.slice(0, 200)}`);
    }
  }
  if (!response.ok) throw new Error(`Upload failed (${response.status})`);
}

/** The stored file, or null when it does not exist. */
export async function getFile(
  key: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  const remote = supabase();
  if (!remote) {
    if (process.env.NODE_ENV === "production") throw new StorageNotConfiguredError();
    try {
      const body = await readFile(path.join(LOCAL_DIR, ...key.split("/")));
      return { body, contentType: contentTypeOf(key) };
    } catch {
      return null;
    }
  }
  const response = await fetch(objectUrl(remote.url, key), { headers: remote.headers });
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  return {
    body: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? contentTypeOf(key),
  };
}

function contentTypeOf(key: string): string {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

/** Removes a stored file; a file that is already gone is fine. */
export async function deleteFile(key: string): Promise<void> {
  const remote = supabase();
  if (!remote) {
    if (process.env.NODE_ENV === "production") throw new StorageNotConfiguredError();
    await rm(path.join(LOCAL_DIR, ...key.split("/")), { force: true });
    return;
  }
  const response = await fetch(`${remote.url}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: { ...remote.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [key] }),
  });
  if (!response.ok && response.status !== 404) throw new Error(`Delete failed (${response.status})`);
}
