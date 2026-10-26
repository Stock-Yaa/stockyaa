# Stockyaa

Pharmacy management software sold as a service to many pharmacies.

- A **super admin** runs the platform: creates pharmacies, creates each pharmacy's admin account, assigns plans and controls subscriptions.
- Each **pharmacy admin** runs one pharmacy: products, stock by batch and expiry date, suppliers, purchases, point of sale, customers and reports. A pharmacy never sees another pharmacy's data.

## Product requirements

These apply to everything that is added to the project.

| Requirement | Status |
| --- | --- |
| **Bilingual: English and Thai** from the start. Every screen, message and error exists in both languages; users switch with the EN / ไทย control in the top bar. | Built in |
| **Dark mode** on every screen, switched with the sun/moon button and remembered per browser. | Built in |
| **Database: Supabase (Postgres)**. | Not connected yet. Runs on an embedded local database until `DATABASE_URL` is set. |
| **Stripe subscription billing**. | Later. For now the super admin sets each pharmacy's plan, status and end date by hand. |
| Core modules first; expenses, cash drawer, staff permissions and AI prescription processing afterwards. | Core modules built |

## What is in the app

**Super admin** (`/superadmin`)

- Dashboard: pharmacies, subscriptions ending soon, estimated monthly revenue
- Pharmacies: create with first admin user, edit, suspend, extend subscription, manage users, delete
- Plans: names and monthly prices
- My account: the super admin's own name and password

**Pharmacy admin**

| Tab | Path | What it does |
| --- | --- | --- |
| Dashboard | `/dashboard` | Sales today and this month, low stock, expiring batches, 14-day chart |
| Point of sale | `/pos` | Search or scan, cart, discount, tax, cash / card / transfer, receipt |
| Sales | `/sales` | Sales history, printable receipt, refund |
| Customers | `/customers` | Customer list and purchase history |
| Products | `/products` | Medicines and categories, prices, reorder levels, prescription flag |
| Stock | `/inventory` | Batches, expiry dates, low stock, adjustments, movement history |
| Purchases | `/purchases` | Purchase orders, receiving stock into batches |
| Suppliers | `/suppliers` | Supplier directory |
| Reports | `/reports` | Revenue, profit, best sellers, payment methods, stock value, CSV export |
| Subscription | `/subscription` | Current plan, status and end date |
| Settings | `/settings` | Pharmacy profile, currency, timezone, tax rate, receipt footer, password |

Stock is sold first-expired-first-out, expired batches are never sold, and every stock change is recorded in the movement history.

## Run it locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no `DATABASE_URL`, the app creates an embedded Postgres database in `./.pglite` on first use and fills it with demo data (the first page load takes a few seconds). Delete the `.pglite` folder to start again from fresh demo data.

Demo accounts (local demo database only):

| Role | Email | Password |
| --- | --- | --- |
| Super admin | `superadmin@stockyaa.com` | `stockyaa123` |
| Pharmacy admin (Demo Pharmacy) | `admin@demo-pharmacy.com` | `stockyaa123` |

## Connect Supabase

1. Create a Supabase project and copy its Postgres connection string (Project settings → Database → Connection string → URI; the pooled "transaction" string works).
2. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL`, `AUTH_SECRET`, and the super admin email and password. On a serverless host such as Vercel also set `DATABASE_POOL_MAX=1`.
3. Create the tables, then the plans and super admin:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

4. Start the app. It now uses Supabase; the demo accounts above do not exist there, so sign in with the super admin you set in step 2.

Supabase is used as a plain Postgres database. Sign-in, sessions and tenant isolation are handled by the app, so no Supabase Auth or row-level-security setup is needed.

## Tech

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Drizzle ORM · Postgres (Supabase in production, PGlite locally) · cookie sessions signed with `jose`, passwords hashed with `bcryptjs`.

```
src/app/(pharmacy)/   pharmacy admin pages, one folder per tab
src/app/superadmin/   super admin pages
src/app/login/        sign in
src/components/ui/    shared UI kit
src/db/               schema, connection, seed data
src/i18n/messages/    en/ and th/ translations, one file per module
src/lib/              auth, stock logic, dates and time zones, reports, formatting, validation
drizzle/              SQL migrations
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` / `npm run lint` | Checks |
| `npm run db:generate` | Create a migration after changing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:seed` | Create plans and the super admin in an empty database |

Conventions for contributors (and AI agents) are in [AGENTS.md](AGENTS.md).
