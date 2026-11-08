import { and, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { PharmacyProvider } from "@/components/pharmacy-context";
import { SubscriptionBanner } from "@/components/subscription-banner";
import { getDb } from "@/db";
import { branches as branchesTable } from "@/db/schema";
import { requirePharmacy } from "@/lib/auth";
import { canSwitchBranch } from "@/lib/active-branch";
import { planLimits } from "@/lib/branches";
import { countUnreadNotifications, scanNotificationsIfDue } from "@/lib/notifications";

export default async function PharmacyLayout({ children }: { children: React.ReactNode }) {
  // allowInactive: the shell must still render for /subscription. Every other
  // page calls requirePharmacy() itself, which redirects lapsed pharmacies.
  const { user, pharmacy, branch, branches } = await requirePharmacy({ allowInactive: true });
  const db = await getDb();
  // Page loads keep notifications current (at most one scan every few minutes).
  await scanNotificationsIfDue(db, pharmacy);
  const [unreadNotifications, limits, activeBranches] = await Promise.all([
    countUnreadNotifications(db, { user, pharmacy, branch }),
    planLimits(db, pharmacy),
    db.$count(
      branchesTable,
      and(eq(branchesTable.pharmacyId, pharmacy.id), eq(branchesTable.isActive, true)),
    ),
  ]);
  // A Standard plan hides the branch links, unless the pharmacy still runs
  // several branches (moved down from a multi-branch plan) and must manage them.
  const multiBranch = limits.multiBranch || activeBranches > 1;

  return (
    <PharmacyProvider
      value={{
        id: pharmacy.id,
        name: pharmacy.name,
        currency: pharmacy.currency,
        timezone: pharmacy.timezone,
        taxRate: pharmacy.taxRate,
        branch: { id: branch.id, name: branch.name },
        branches: branches.map((b) => ({ id: b.id, name: b.name })),
        canSwitchBranch: canSwitchBranch(user),
      }}
    >
      <AppShell
        variant="pharmacy"
        orgName={pharmacy.name}
        user={{ name: user.name, role: user.role }}
        banner={<SubscriptionBanner pharmacy={pharmacy} />}
        unreadNotifications={unreadNotifications}
        multiBranch={multiBranch}
      >
        {children}
      </AppShell>
    </PharmacyProvider>
  );
}
