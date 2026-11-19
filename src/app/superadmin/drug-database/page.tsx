import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { users, type DrugSyncIssue } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { requireSuperAdmin } from "@/lib/auth";
import { latestDrugSync } from "@/lib/drug-database";
import { DRUG_TABS } from "@/lib/drug-sheet";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { LabelTest, type LabelTestParams } from "./label-test";
import { SyncForm } from "./sync-form";

export const generateMetadata = pageTitle("drugDb.title");

// Downloading and loading the sheet (about 9 MB, 80,000 rows) takes a while.
export const maxDuration = 300;

const PROBLEM_KEYS: Record<DrugSyncIssue["problem"], MessageKey> = {
  number: "drugDb.problemNumber",
  wholeNumber: "drugDb.problemWholeNumber",
  yesNo: "drugDb.problemYesNo",
  value: "drugDb.problemValue",
  required: "drugDb.problemRequired",
  duplicate: "drugDb.problemDuplicate",
  inconsistent: "drugDb.problemInconsistent",
};

export default async function DrugDatabasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin();
  const [t, f, db, sp] = await Promise.all([getT(), getFormat(), getDb(), searchParams]);
  const sync = await latestDrugSync(db);
  const [syncUser] = sync?.userId
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, sync.userId))
    : [];

  const param = (key: string) => {
    const v = sp[key];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const params: LabelTestParams = {
    q: param("q"),
    tpu: param("tpu"),
    group: param("group"),
    years: param("years"),
    months: param("months"),
    weight: param("weight"),
    test: param("test"),
    lang: param("lang"),
    ind: param("ind"),
  };

  return (
    <>
      <PageHeader title={t("drugDb.title")} description={t("drugDb.description")} />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("drugDb.syncTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <SyncForm defaultUrl={sync?.sourceUrl ?? ""} tabs={Object.values(DRUG_TABS).join(", ")} />

            {sync ? (
              <div className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  {syncUser
                    ? t("drugDb.lastSync", { date: f.dateTime(sync.createdAt), name: syncUser.name })
                    : t("drugDb.lastSyncNoUser", { date: f.dateTime(sync.createdAt) })}
                </p>
                <Table>
                  <THead>
                    <tr>
                      <TH>{t("drugDb.colTab")}</TH>
                      <TH className="text-right">{t("drugDb.colRows")}</TH>
                      <TH className="text-right">{t("drugDb.colApproved")}</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {/* In tab order: Postgres stores jsonb keys in its own order. */}
                    {Object.values(DRUG_TABS).map((tab) => {
                      const c = sync.counts[tab];
                      if (!c) return null;
                      return (
                        <TR key={tab}>
                          <TD className="font-medium">{tab}</TD>
                          <TD className="text-right tabular-nums">{f.number(c.rows)}</TD>
                          <TD className="text-right tabular-nums">
                            {c.approved === undefined ? "—" : f.number(c.approved)}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>

                {sync.issueCount > 0 && (
                  <details className="group grid gap-2">
                    <summary className="cursor-pointer text-sm font-semibold text-warning">
                      {t("drugDb.issuesTitle", { count: f.number(sync.issueCount) })}
                    </summary>
                    <p className="my-2 text-sm text-muted-foreground">
                      {t("drugDb.issuesHint")}
                      {sync.issueCount > sync.issues.length &&
                        ` ${t("drugDb.issuesMore", { shown: sync.issues.length })}`}
                    </p>
                    <Table>
                      <THead>
                        <tr>
                          <TH>{t("drugDb.colTab")}</TH>
                          <TH className="text-right">{t("drugDb.colRow")}</TH>
                          <TH>{t("drugDb.colColumn")}</TH>
                          <TH>{t("drugDb.colValue")}</TH>
                          <TH>{t("drugDb.colProblem")}</TH>
                        </tr>
                      </THead>
                      <TBody>
                        {sync.issues.map((issue, i) => (
                          <TR key={i}>
                            <TD>{issue.tab}</TD>
                            <TD className="text-right tabular-nums">{issue.row}</TD>
                            <TD className="font-mono text-xs">{issue.column || "—"}</TD>
                            <TD className="max-w-xs truncate">{issue.value || "—"}</TD>
                            <TD>{t(PROBLEM_KEYS[issue.problem])}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </details>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm">
                <p className="font-medium">{t("drugDb.neverSynced")}</p>
                <p className="text-muted-foreground">{t("drugDb.neverSyncedHint")}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-col items-start gap-1">
            <CardTitle>{t("drugDb.testTitle")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("drugDb.testHint")}</p>
          </CardHeader>
          <CardContent>
            {sync ? <LabelTest params={params} /> : <p className="text-sm text-muted-foreground">{t("drugDb.dbEmpty")}</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
