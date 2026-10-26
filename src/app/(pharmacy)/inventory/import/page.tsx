import { PageHeader } from "@/components/ui/page";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { pageTitle } from "@/lib/metadata";
import { BulkImport } from "./bulk-import";

export const generateMetadata = pageTitle("nav.bulkImport");

export default async function BulkImportPage() {
  await requirePharmacy();
  const t = await getT();

  return (
    <>
      <PageHeader title={t("nav.bulkImport")} description={t("bulkImport.description")} />
      <BulkImport />
    </>
  );
}
