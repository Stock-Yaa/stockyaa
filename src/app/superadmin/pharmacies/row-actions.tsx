"use client";

import { Ban, CircleCheck, CreditCard, Eye, Pencil, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n/client";
import { RecordPaymentDialog, type PlanPrice } from "../payments/record-payment-form";
import { DeletePharmacyDialog } from "./[id]/delete-pharmacy";
import { setPharmacyStatus } from "./actions";

type Dialog = "payment" | "status" | "delete" | null;

/** The "⋮" menu on a row of the pharmacy list, and the dialogs it opens. */
export function PharmacyRowActions({
  pharmacy,
  plans,
  today,
  stripeConfigured,
}: {
  pharmacy: { id: string; name: string; planId: string | null; suspended: boolean };
  plans: PlanPrice[];
  /** Today in the pharmacy's time zone (YYYY-MM-DD). */
  today: string;
  stripeConfigured: boolean;
}) {
  const t = useT();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const detail = `/superadmin/pharmacies/${pharmacy.id}`;

  return (
    <>
      <DropdownMenu
        label={t("platform.rowActions", { name: pharmacy.name })}
        items={[
          { label: t("platform.viewDetails"), icon: Eye, href: detail },
          { label: t("platform.editDetails"), icon: Pencil, href: `${detail}/edit` },
          "separator",
          { label: t("billing.recordPayment"), icon: Wallet, onSelect: () => setDialog("payment") },
          {
            label: t("platform.sendCheckout"),
            icon: CreditCard,
            disabled: true,
            hint: stripeConfigured ? t("platform.sendCheckoutSoon") : t("platform.sendCheckoutNeedsStripe"),
          },
          "separator",
          pharmacy.suspended
            ? { label: t("platform.reactivatePharmacy"), icon: CircleCheck, onSelect: () => setDialog("status") }
            : { label: t("platform.suspendPharmacy"), icon: Ban, onSelect: () => setDialog("status") },
          "separator",
          {
            label: t("platform.deletePharmacy"),
            icon: Trash2,
            tone: "danger",
            onSelect: () => setDialog("delete"),
          },
        ]}
      />

      <RecordPaymentDialog
        open={dialog === "payment"}
        onClose={close}
        pharmacyId={pharmacy.id}
        plans={plans}
        currentPlanId={pharmacy.planId}
        today={today}
      />
      <ConfirmDialog
        open={dialog === "status"}
        onClose={close}
        action={setPharmacyStatus.bind(null, pharmacy.id, pharmacy.suspended ? "active" : "suspended")}
        title={pharmacy.suspended ? t("platform.reactivateTitle") : t("platform.suspendTitle")}
        body={pharmacy.suspended ? t("platform.reactivateBody") : t("platform.suspendBody")}
        confirmLabel={pharmacy.suspended ? t("platform.reactivate") : t("platform.suspend")}
        destructive={!pharmacy.suspended}
      />
      <DeletePharmacyDialog
        open={dialog === "delete"}
        onClose={close}
        pharmacy={pharmacy}
        body={t("platform.deleteModalBodyShort", { name: pharmacy.name })}
      />
    </>
  );
}
