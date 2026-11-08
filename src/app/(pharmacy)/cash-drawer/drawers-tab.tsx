import { and, eq, isNull } from "drizzle-orm";
import { Power, PowerOff } from "lucide-react";
import { Badge } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { cashShifts, users } from "@/db/schema";
import { listDrawers } from "@/lib/cash-drawer";
import { setDrawerActive } from "./actions";
import { DrawerFormButton } from "./manager-forms";
import type { Ctx } from "./shared";

/** The current branch's drawers: add, rename, set the float, deactivate. */
export async function DrawersTab({ ctx }: { ctx: Ctx }) {
  const { db, pharmacy, branch, t, f } = ctx;
  const [drawers, open] = await Promise.all([
    listDrawers(db, branch, t("cashDrawer.defaultDrawerName")),
    db
      .select({ drawerId: cashShifts.drawerId, owner: users.name, openedAt: cashShifts.openedAt })
      .from(cashShifts)
      .leftJoin(users, eq(users.id, cashShifts.openedBy))
      .where(
        and(
          eq(cashShifts.pharmacyId, pharmacy.id),
          eq(cashShifts.branchId, branch.id),
          isNull(cashShifts.closedAt),
        ),
      ),
  ]);
  const openByDrawer = new Map(open.map((o) => [o.drawerId, o]));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("cashDrawer.drawersHint", { branch: branch.name })}</p>
        <DrawerFormButton />
      </div>
      <Table>
        <THead>
          <tr>
            <TH>{t("common.name")}</TH>
            <TH className="text-right">{t("cashDrawer.floatAmount")}</TH>
            <TH>{t("cashDrawer.currentSession")}</TH>
            <TH>{t("common.status")}</TH>
            <TH className="text-right">{t("common.actions")}</TH>
          </tr>
        </THead>
        <TBody>
          {drawers.map((drawer) => {
            const session = openByDrawer.get(drawer.id);
            return (
              <TR key={drawer.id}>
                <TD className="font-medium">{drawer.name}</TD>
                <TD className="text-right tabular-nums">{f.money(drawer.floatAmount)}</TD>
                <TD>
                  {session ? (
                    <span>
                      {session.owner ?? "—"}{" "}
                      <span className="text-muted-foreground">
                        · {t("cashDrawer.openedOn", { date: f.dateTime(session.openedAt) })}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t("cashDrawer.noSession")}</span>
                  )}
                </TD>
                <TD>
                  <Badge tone={drawer.isActive ? "success" : "muted"}>
                    {drawer.isActive ? t("common.active") : t("common.inactive")}
                  </Badge>
                </TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <DrawerFormButton
                      drawer={{ id: drawer.id, name: drawer.name, floatAmount: drawer.floatAmount }}
                    />
                    {drawer.isActive ? (
                      <ConfirmButton
                        action={setDrawerActive.bind(null, drawer.id, false, branch.id)}
                        title={t("cashDrawer.deactivateDrawerTitle")}
                        body={t("cashDrawer.deactivateDrawerBody")}
                        confirmLabel={t("cashDrawer.deactivate")}
                        variant="ghost"
                        size="icon"
                        aria-label={t("cashDrawer.deactivate")}
                        disabled={Boolean(session)}
                      >
                        <PowerOff />
                      </ConfirmButton>
                    ) : (
                      <ConfirmButton
                        action={setDrawerActive.bind(null, drawer.id, true, branch.id)}
                        title={t("cashDrawer.activateDrawerTitle")}
                        body={t("cashDrawer.activateDrawerBody")}
                        confirmLabel={t("cashDrawer.activate")}
                        destructive={false}
                        variant="ghost"
                        size="icon"
                        aria-label={t("cashDrawer.activate")}
                      >
                        <Power />
                      </ConfirmButton>
                    )}
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
