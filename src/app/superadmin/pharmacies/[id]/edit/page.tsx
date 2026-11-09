import { asc, eq, or } from "drizzle-orm";
import { ArrowLeft, UserCheck, UserX, Users } from "lucide-react";
import Link from "next/link";
import { SubscriptionBadge } from "@/components/subscription-badge";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { plans } from "@/db/schema";
import { getLocale, getT } from "@/i18n/server";
import { requireSuperAdmin } from "@/lib/auth";
import { dayInTimezone } from "@/lib/dates";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { currencyOptions, timezoneOptions } from "@/lib/options";
import { subscriptionState } from "@/lib/subscription";
import { now } from "@/lib/time";
import { EndDate } from "../../../_components/end-date";
import { setUserActive } from "../../actions";
import { DetailsForm } from "../details-form";
import { loadPharmacy, loadPharmacyUsers } from "../load";
import { QuickExtend, SubscriptionForm } from "../subscription-form";
import { AddAdminButton, ResetPasswordButton } from "../user-forms";

export const generateMetadata = pageTitle("platform.editPharmacy");

export default async function EditPharmacyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const pharmacy = await loadPharmacy(id);
  const db = await getDb();

  const [t, locale, f, planRows, userRows] = await Promise.all([
    getT(),
    getLocale(),
    getFormat(pharmacy),
    // Plans that can be assigned, plus the current one even if it was retired.
    db
      .select()
      .from(plans)
      .where(
        pharmacy.planId
          ? or(eq(plans.isActive, true), eq(plans.id, pharmacy.planId))
          : eq(plans.isActive, true),
      )
      .orderBy(asc(plans.sortOrder), asc(plans.name)),
    loadPharmacyUsers(pharmacy.id),
  ]);

  const planOptions = await Promise.all(
    planRows.map(async (plan) => {
      const price = (await getFormat(null, plan.currency)).money(plan.priceMonthly);
      const name = plan.isActive
        ? plan.name
        : t("platform.planInactiveOption", { name: plan.name });
      return { value: plan.id, label: `${name} · ${t("subscription.perMonth", { price })}` };
    }),
  );

  const current = now();
  const state = subscriptionState(pharmacy, current);
  const endDay = pharmacy.subscriptionEndsAt
    ? dayInTimezone(pharmacy.subscriptionEndsAt, pharmacy.timezone)
    : null;
  const roleLabel = (role: string) =>
    role === "admin" ? t("nav.pharmacyAdmin") : role === "manager" ? t("users.roleManager") : t("nav.staff");

  return (
    <>
      <Link
        href={`/superadmin/pharmacies/${pharmacy.id}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("platform.backToDetails")}
      </Link>
      <PageHeader
        title={t("platform.editTitle", { name: pharmacy.name })}
        description={t("platform.editDescription")}
      >
        <SubscriptionBadge state={state} />
      </PageHeader>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card id="details" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{t("platform.sectionPharmacy")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailsForm
              pharmacyId={pharmacy.id}
              values={{
                name: pharmacy.name,
                email: pharmacy.email,
                phone: pharmacy.phone,
                address: pharmacy.address,
                licenseNumber: pharmacy.licenseNumber,
                currency: pharmacy.currency,
                timezone: pharmacy.timezone,
              }}
              currencyOptions={currencyOptions(locale, pharmacy.currency)}
              timezoneOptions={timezoneOptions(pharmacy.timezone)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("platform.sectionSubscription")}</CardTitle>
            <SubscriptionBadge state={state} />
          </CardHeader>
          <CardContent>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-lg bg-muted/60 p-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t("platform.colValidUntil")}</p>
                <div className="mt-0.5 font-medium">
                  <EndDate endsAt={pharmacy.subscriptionEndsAt} format={f} />
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  {t("platform.quickExtend")}
                </p>
                <QuickExtend
                  pharmacyId={pharmacy.id}
                  hasEndDate={pharmacy.subscriptionEndsAt !== null}
                />
              </div>
              <p className="w-full text-xs text-muted-foreground">
                {t("platform.extendHint")}
                {(state === "suspended" || state === "cancelled") &&
                  ` ${t("platform.extendNoAccessNote")}`}
              </p>
            </div>
            <SubscriptionForm
              key={`${pharmacy.planId}|${pharmacy.subscriptionStatus}|${endDay}`}
              pharmacyId={pharmacy.id}
              planId={pharmacy.planId}
              status={pharmacy.subscriptionStatus}
              endDate={endDay}
              planOptions={planOptions}
            />
          </CardContent>
        </Card>
      </div>

      <Card id="users" className="mt-4 scroll-mt-20">
        <CardHeader>
          <CardTitle>{t("platform.usersPasswordsTitle")}</CardTitle>
          <AddAdminButton pharmacyId={pharmacy.id} />
        </CardHeader>
        <CardContent>
          {userRows.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t("platform.usersEmpty")}
              hint={t("platform.usersEmptyHint")}
            />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t("common.name")}</TH>
                  <TH>{t("common.email")}</TH>
                  <TH>{t("platform.colRole")}</TH>
                  <TH>{t("common.status")}</TH>
                  <TH>{t("platform.colLastLogin")}</TH>
                  <TH className="text-right">{t("common.actions")}</TH>
                </tr>
              </THead>
              <TBody>
                {userRows.map((user) => (
                  <TR key={user.id}>
                    <TD className="font-medium">{user.name}</TD>
                    <TD>{user.email}</TD>
                    <TD>{roleLabel(user.role)}</TD>
                    <TD>
                      <Badge tone={user.isActive ? "success" : "muted"}>
                        {user.isActive ? t("common.active") : t("common.inactive")}
                      </Badge>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {user.lastLoginAt ? (
                        f.dateTime(user.lastLoginAt)
                      ) : (
                        <span className="text-muted-foreground">
                          {t("platform.neverSignedIn")}
                        </span>
                      )}
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <ResetPasswordButton
                          pharmacyId={pharmacy.id}
                          user={{ id: user.id, name: user.name }}
                        />
                        {user.isActive ? (
                          <ConfirmButton
                            action={setUserActive.bind(null, pharmacy.id, user.id, false)}
                            title={t("platform.deactivateTitle")}
                            body={t("platform.deactivateBody", { name: user.name })}
                            confirmLabel={t("platform.deactivate")}
                            variant="ghost"
                            size="icon"
                            aria-label={t("platform.deactivate")}
                          >
                            <UserX />
                          </ConfirmButton>
                        ) : (
                          <ConfirmButton
                            action={setUserActive.bind(null, pharmacy.id, user.id, true)}
                            title={t("platform.activateTitle")}
                            body={t("platform.activateBody", { name: user.name })}
                            confirmLabel={t("platform.activate")}
                            destructive={false}
                            variant="ghost"
                            size="icon"
                            aria-label={t("platform.activate")}
                          >
                            <UserCheck />
                          </ConfirmButton>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

    </>
  );
}
