import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { seedDatabase } from "./seed";

// Both drivers expose the same query API; the PGlite type is used as the
// common one so callers don't have to care which is behind it.
export type Db = PgliteDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

const globalForDb = globalThis as unknown as { __stockyaaDb?: Promise<Db> };

async function init(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    // Supabase / any Postgres. `prepare: false` keeps it compatible with the
    // Supabase transaction pooler. Run `npm run db:migrate` to apply schema.
    const max = Number(process.env.DATABASE_POOL_MAX) || 5;
    const client = postgres(url, { prepare: false, max });
    const db = drizzlePostgres(client, { schema });
    // Drizzle makes the driver pass timestamps through untouched, expecting
    // its column encoders to have turned them into strings. A Date placed in a
    // raw sql`` fragment skips those encoders, so convert it here, as PGlite
    // does, instead of failing with ERR_INVALID_ARG_TYPE.
    const serializeDate = (value: unknown) =>
      value instanceof Date ? value.toISOString() : value;
    for (const type of [1082, 1114, 1184]) {
      client.options.serializers[type] = serializeDate;
    }
    return db as unknown as Db;
  }

  // No DATABASE_URL: embedded Postgres persisted in ./.pglite, migrated and
  // seeded with demo data on first use. For local development only.
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite("./.pglite");
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: "./drizzle" });
  await seedDatabase(db, { demo: true });
  return db;
}

export function getDb(): Promise<Db> {
  if (!globalForDb.__stockyaaDb) {
    globalForDb.__stockyaaDb = init().catch((err) => {
      globalForDb.__stockyaaDb = undefined;
      throw err;
    });
  }
  return globalForDb.__stockyaaDb;
}

export { schema };
