// Creates the plans and the first super admin in an empty database.
// Usage: npm run db:seed
//   SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD / SUPERADMIN_NAME  the account to create
//   SEED_DEMO=true                                            also add a demo pharmacy
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the real environment.
}

async function main() {
  // Imported here so the env file above is loaded before the db module reads it.
  const { getDb } = await import("../src/db");
  const { seedDatabase } = await import("../src/db/seed");

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. The local embedded database seeds itself.");
    process.exit(1);
  }
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!email || !password || password.length < 8) {
    console.error("Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD (8+ characters).");
    process.exit(1);
  }

  const db = await getDb();
  const seeded = await seedDatabase(db, {
    demo: process.env.SEED_DEMO === "true",
    superAdmin: { name: process.env.SUPERADMIN_NAME ?? "Platform Admin", email, password },
  });
  console.log(seeded ? `Seeded. Super admin: ${email}` : "Database already has users; nothing done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
