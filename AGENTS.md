<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Stockyaa

Multi-tenant pharmacy management SaaS. A **super admin** (`/superadmin`) creates pharmacies and manages their subscriptions; each **pharmacy admin** manages one pharmacy (`/dashboard`, `/pos`, `/products`, …). Target market is Thailand.

A pharmacy has one or more **branches** (`/branches`; the plan's `maxBranches` caps the active ones). Products, prices, categories, suppliers, customers and settings are shared by the whole pharmacy; **stock, sales, purchases and the cash drawer belong to one branch**. Admins work in every branch and switch from the header (`stockyaa_branch` cookie); staff (`users.branchId`) work in one. Stock moves between branches through `/transfers` (sent, in transit, then received or cancelled).

## Standing requirements

- **Bilingual: English and Thai.** No hard-coded UI text, ever. Every string lives in `src/i18n/messages/en/<namespace>.ts` with the same key in `src/i18n/messages/th/<namespace>.ts` (the Thai file is typed `typeof en`, so a missing key fails type-check). Keys are `"namespace.key"`; placeholders are `{name}`.
  - Server components and actions: `const t = await getT()` from `@/i18n/server`.
  - Client components: `const t = useT()` from `@/i18n/client`.
- **Dark mode.** The theme is a cookie read by the root layout (no script, no flash); with no cookie the system preference applies. Use only the semantic colour tokens from `src/app/globals.css` (`bg-background`, `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-primary-foreground`, `bg-accent`, `text-destructive`, `text-success`, `text-warning`, `text-info`, e.g. `bg-success/15`). Never raw palette classes (`bg-white`, `text-gray-500`, `bg-emerald-100`), which break dark mode.
- **Tenant isolation.** Every pharmacy page and server action starts with `const { user, pharmacy, branch } = await requirePharmacy()` and every query filters on `pharmacy.id`, including updates and deletes addressed by id. Super admin pages and actions start with `requireSuperAdmin()`. Never trust an id from the client without the pharmacy filter.
- **Branch isolation.** Queries on branch data (`batches`, `stock_movements`, `sales`, `purchases`, `cash_shifts`, and their child tables through them) also filter on the branch: `inScope(table, branchScope(branch))` from `src/lib/branches.ts`. A row of another branch is "not found". The type checker does not catch a missing read filter, so check by hand. Cross-branch views are deliberate and admin-only: the dashboard and reports through `resolveReportScope` (`src/lib/report-scope.ts`, `?branch=`), stock by branch, and transfers with `?scope=all`; customers stay pharmacy-wide. Actions that write branch data start with `if (branchChanged(formData, branch)) return { ok: false, message: t("branches.changedElsewhere") }` (`useFormAction` sends the rendering branch automatically); actions without FormData take the branch id explicitly. Admin-only pages check `canSwitchBranch(user)`.
- **Database** is Postgres through Drizzle (`src/db/schema.ts`). Locally it is embedded PGlite in `./.pglite` (auto-migrated and seeded); production is Supabase via `DATABASE_URL`. No Supabase-specific or Stripe code yet; both come later.

## Conventions

- Follow `src/app/(pharmacy)/suppliers/` as the model module: `page.tsx` (server component: list, search, pagination), `actions.ts` (`"use server"`, zod validation, returns `ActionState`), a client form component using `useFormAction`.
- UI kit in `src/components/ui/`: `Button`/`buttonClass`, `Input`/`Select`/`Textarea`/`Field`, `Card`/`StatCard`/`Badge`, `Table` parts, `PageHeader`/`Toolbar`/`EmptyState`, `Modal`/`ModalFooter`, `ConfirmButton`, `SearchInput`/`FilterSelect`/`Pagination`. Icons from `lucide-react`.
- Validation helpers in `src/lib/validation.ts`; their error messages are translation keys.
- Money, numbers and dates: `getFormat(pharmacy)` on the server (`@/lib/format-server`), `useFormat()` in client components (`@/components/pharmacy-context`). `f.money`, `f.number`, `f.dateTime` (timestamps), `f.day` (YYYY-MM-DD strings such as expiry dates). Money columns come back from Drizzle as JS numbers; round computed money with `round2`.
- Stock changes go through `src/lib/stock.ts` inside `db.transaction` (`addBatch`, `deductStockFefo`, `changeBatchQuantity`, each with a `branchId`) so every change writes a `stock_movements` row.
- Calendar days and time zones live in `src/lib/dates.ts`: "today" is `todayInTimezone(pharmacy.timezone)`, and date filters turn days into instants with `zonedDayStart` / `zonedRange`. Do not write new offset maths.
- Inside `db.transaction` use only `tx`, never `db`: production may run with a single pooled connection (`DATABASE_POOL_MAX=1`) and a second query on `db` would wait forever.
- Browser-tab titles are translated: `export const generateMetadata = pageTitle("suppliers.title")` from `@/lib/metadata`.
- Code shared by the pharmacy and super admin areas belongs in `src/lib` or `src/components`, not in either route folder.
- SQL aggregates return strings from Postgres: write ``sql<number>`sum(...)`.mapWith(Number)``.
- Sessions carry a fingerprint of the password hash (`src/lib/auth.ts`), so changing a password signs out every other session; call `createSession` again when a user changes their own.
- Components must be pure: no `Date.now()` / `new Date()` during render and no `setState` inside `useEffect` (lint errors). Use `src/lib/time.ts` for the clock.
- Next.js 16: `params` and `searchParams` are Promises; `cookies()` is async.
- After changing `src/db/schema.ts` run `npm run db:generate` and commit the new file in `drizzle/`.
- Checks: `npm run typecheck` and `npm run lint`.
