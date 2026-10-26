import { AppShell } from "@/components/app-shell";
import { PharmacyProvider } from "@/components/pharmacy-context";
import { SubscriptionBanner } from "@/components/subscription-banner";
import { getDb } from "@/db";
import { requirePharmacy } from "@/lib/auth";
import { canSwitchBranch } from "@/lib/active-branch";
import { countUnreadNotifications, scanNotificationsIfDue } from "@/lib/notifications";

export default async function PharmacyLayout({ children }: { children: React.ReactNode }) {
  // allowInactive: the shell must still render for /subscription. Every other
  // page calls requirePharmacy() itself, which redirects lapsed pharmacies.
  const { user, pharmacy, branch, branches } = await requirePharmacy({ allowInactive: true });
  const db = await getDb();
  // Page loads keep notifications current (at most one scan every few minutes).
  await scanNotificationsIfDue(db, pharmacy);
  const unreadNotifications = await countUnreadNotifications(db, { user, pharmacy, branch });

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
      >
        {children}
      </AppShell>
    </PharmacyProvider>
  );
}
