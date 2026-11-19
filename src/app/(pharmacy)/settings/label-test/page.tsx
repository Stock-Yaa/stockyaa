import { DispensingSticker, Rotated, STICKER_CSS } from "@/components/dispensing-sticker";
import { PageHeader } from "@/components/ui/page";
import { createTranslator, getMessages } from "@/i18n/messages";
import { getLocale, getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { labelSize, stickerWords } from "@/lib/label-layout";
import { pageTitle } from "@/lib/metadata";
import { now } from "@/lib/time";
import { sampleLabel } from "../label-sample";
import { PrintNow } from "./print-now";

export const generateMetadata = pageTitle("settings.labelTestTitle");

/** One sample sticker at the saved size, printed straight away: to check the printer. */
export default async function LabelTestPage() {
  const { pharmacy, branch } = await requirePharmacy();
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const labelT = createTranslator(getMessages(locale));
  const size = labelSize(pharmacy);
  const page = size.rotate ? `${size.heightMm}mm ${size.widthMm}mm` : `${size.widthMm}mm ${size.heightMm}mm`;

  return (
    <>
      <style>{`${STICKER_CSS}\n@page { size: ${page}; margin: 0; }`}</style>
      <div className="print:hidden">
        <PageHeader
          title={t("settings.labelTestTitle")}
          description={t("settings.labelTestDescription", { width: size.widthMm, height: size.heightMm })}
        >
          <PrintNow />
        </PageHeader>
      </div>
      <Rotated size={size}>
        <DispensingSticker
          content={sampleLabel(labelT, pharmacy, branch, locale, now())}
          size={{ ...size, rotate: false }}
          words={stickerWords(labelT)}
        />
      </Rotated>
    </>
  );
}
