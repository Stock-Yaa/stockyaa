import { and, asc, eq, ne } from "drizzle-orm";
import { Power, PowerOff } from "lucide-react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PageHeader } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getT } from "@/i18n/server";
import { canSwitchBranch } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { listBranches } from "@/lib/branches";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { setUserActive } from "./actions";
import { ResetPasswordButton, UserFormButton } from "./user-forms";

export const generateMetadata = pageTitle("users.title");

/** The pharmacy's users, for admins: add staff, assign their branch, reset passwords. */
export default async function UsersPage() {
  const { user: me, pharmacy, branch } = await requirePharmacy();
  if (!canSwitchBranch(me)) notFound();
  const [t, f, db] = await Promise.all([getT(), getFormat(pharmacy), getDb()]);

  const [rows, allBranches] = await Promise.all([
    // Explicit columns: the password hash never leaves the database.
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        branchId: users.branchId,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(and(eq(users.pharmacyId, pharmacy.id), ne(users.role, "superadmin")))
      .orderBy(asc(users.createdAt)),
    listBranches(db, pharmacy.id),
  ]);

  const branchById = new Map(allBranches.map((b) => [b.id, b]));
  const options = allBranches.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name }));

  return (
    <>
      <PageHeader title={t("users.title")} description={t("users.description")}>
        <UserFormButton branches={options} defaultBranchId={branch.id} />
      </PageHeader>

      <Table>
        <THead>
          <tr>
            <TH>{t("common.name")}</TH>
            <TH>{t("common.email")}</TH>
            <TH>{t("users.role")}</TH>
            <TH>{t("users.branch")}</TH>
            <TH>{t("common.status")}</TH>
            <TH>{t("users.lastSignIn")}</TH>
            <TH className="text-right">{t("common.actions")}</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((row) => {
            const isSelf = row.id === me.id;
            const role = row.role === "admin" ? "admin" : "staff";
            const ownBranch = row.branchId ? branchById.get(row.branchId) : undefined;
            return (
              <TR key={row.id}>
                <TD>
                  <span className="font-medium">{row.name}</span>
                  {isSelf && (
                    <Badge tone="info" className="ml-2">
                      {t("users.you")}
                    </Badge>
                  )}
                </TD>
                <TD>{row.email}</TD>
                <TD>{role === "admin" ? t("users.roleAdmin") : t("users.roleStaff")}</TD>
                <TD>
                  {role === "admin"
                    ? t("users.allBranches")
                    : ownBranch
                      ? `${ownBranch.name}${ownBranch.isActive ? "" : t("users.inactiveBranch")}`
                      : "—"}
                </TD>
                <TD>
                  <Badge tone={row.isActive ? "success" : "muted"}>
                    {row.isActive ? t("common.active") : t("common.inactive")}
                  </Badge>
                </TD>
                <TD className="whitespace-nowrap">
                  {row.lastLoginAt ? (
                    f.dateTime(row.lastLoginAt)
                  ) : (
                    <span className="text-muted-foreground">{t("users.never")}</span>
                  )}
                </TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <UserFormButton
                      user={{ ...row, role }}
                      branches={options}
                      defaultBranchId={branch.id}
                      isSelf={isSelf}
                    />
                    {!isSelf && <ResetPasswordButton user={row} />}
                    {!isSelf &&
                      (row.isActive ? (
                        <ConfirmButton
                          action={setUserActive.bind(null, row.id, false)}
                          title={t("users.deactivateTitle")}
                          body={t("users.deactivateBody")}
                          confirmLabel={t("users.deactivate")}
                          variant="ghost"
                          size="icon"
                          aria-label={t("users.deactivate")}
                        >
                          <PowerOff />
                        </ConfirmButton>
                      ) : (
                        <ConfirmButton
                          action={setUserActive.bind(null, row.id, true)}
                          title={t("users.activateTitle")}
                          body={t("users.activateBody")}
                          confirmLabel={t("users.activate")}
                          destructive={false}
                          variant="ghost"
                          size="icon"
                          aria-label={t("users.activate")}
                        >
                          <Power />
                        </ConfirmButton>
                      ))}
                  </div>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </>
  );
}
