import { PageHeader } from "@/components/ui/page";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { pageTitle } from "@/lib/metadata";
import { now } from "@/lib/time";
import { requiredId } from "@/lib/validation";
import { LabelsView } from "../../_labels/labels-view";
import type { LabelItem } from "../../_labels/build";

export const generateMetadata = pageTitle("dispensing.title");

/** "id:2,id:1" from the POS cart; anything that is not a product id and a quantity is ignored. */
function parseItems(value: string): LabelItem[] {
  return value
    .split(",")
    .slice(0, 100)
    .map((part) => {
      const [productId, qty] = part.split(":");
      const quantity = Number(qty);
      return requiredId.safeParse(productId).success && Number.isInteger(quantity) && quantity > 0 && quantity <= 100_000
        ? { productId, quantity }
        : null;
    })
    .filter((item): item is LabelItem => item !== null);
}

/**
 * Dispensing labels for the POS cart, printed before the sale is completed
 * (opened in a new tab from the cart). Products are checked against the
 * pharmacy when the labels are built and again when they are recorded.
 */
export default async function PosLabelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePharmacy();
  const [sp, t] = await Promise.all([searchParams, getT()]);
  const raw = sp.items;
  const itemsParam = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const items = parseItems(itemsParam);

  return (
    <>
      <div className="print:hidden">
        <PageHeader title={t("dispensing.title")} description={t("dispensing.descriptionCart")} />
      </div>
      <LabelsView
        searchParams={sp}
        items={items}
        saleId={null}
        date={now()}
        defaultPatientName=""
        hidden={{ items: itemsParam }}
      />
    </>
  );
}
