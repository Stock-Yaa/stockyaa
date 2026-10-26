import { AppShell } from "@/components/app-shell";
import { getT } from "@/i18n/server";
import { requireSuperAdmin } from "@/lib/auth";

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();
  const t = await getT();
  return (
    <AppShell
      variant="platform"
      orgName={t("nav.platformAdmin")}
      user={{ name: user.name, role: user.role }}
    >
      {children}
    </AppShell>
  );
}
