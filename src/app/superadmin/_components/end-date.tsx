import { daysLeftLabel } from "@/lib/subscription";
import { getT } from "@/i18n/server";
import type { Format } from "@/lib/format";

/** A subscription end date with "n days left" under it while it is still ahead. */
export async function EndDate({ endsAt, format }: { endsAt: Date | null; format: Format }) {
  const t = await getT();
  if (!endsAt) {
    return <span className="text-muted-foreground">{t("subscription.noEndDate")}</span>;
  }
  const left = daysLeftLabel(t, endsAt);
  return (
    <div>
      <p className="whitespace-nowrap tabular-nums">{format.date(endsAt)}</p>
      {left && <p className="text-xs whitespace-nowrap text-muted-foreground">{left}</p>}
    </div>
  );
}
