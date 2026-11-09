"use client";

import { Check, Lock, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useFormAction } from "@/components/ui/use-form-action";
import { useT } from "@/i18n/client";
import { decideReview, forceClose, saveDrawer } from "./actions";
import { CashCounter } from "./cash-inputs";

/** Approve / Reject buttons of a review item; rejecting asks for a note. */
export function ReviewDecision({ reviewId }: { reviewId: string }) {
  const t = useT();
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const close = () => setDecision(null);
  const { onSubmit, pending, errors } = useFormAction(decideReview, { onSuccess: close });

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setDecision("rejected")}>
          <X />
          {t("cashDrawer.reject")}
        </Button>
        <Button size="sm" onClick={() => setDecision("approved")}>
          <Check />
          {t("cashDrawer.approve")}
        </Button>
      </div>
      <Modal
        open={decision !== null}
        onClose={close}
        title={t(decision === "rejected" ? "cashDrawer.rejectTitle" : "cashDrawer.approveTitle")}
        size="sm"
      >
        <form onSubmit={onSubmit} className="grid gap-4">
          <input type="hidden" name="reviewId" value={reviewId} />
          <input type="hidden" name="decision" value={decision ?? ""} />
          <Field
            label={t("cashDrawer.managerNote")}
            htmlFor="note"
            error={errors.note}
            required={decision === "rejected"}
          >
            <Textarea id="note" name="note" rows={3} maxLength={500} autoFocus />
          </Field>
          <ModalFooter>
            <Button variant="outline" onClick={close} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant={decision === "rejected" ? "destructive" : "primary"} disabled={pending}>
              {pending
                ? t("common.saving")
                : t(decision === "rejected" ? "cashDrawer.reject" : "cashDrawer.approve")}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}

/** A manager closes a forgotten session with their own count. */
export function ForceCloseButton({ shiftId }: { shiftId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { onSubmit, pending, errors } = useFormAction(forceClose, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Lock />
        {t("cashDrawer.forceClose")}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("cashDrawer.forceClose")}
        description={t("cashDrawer.forceCloseHint")}
        size="lg"
      >
        <form onSubmit={onSubmit} className="grid gap-4">
          <input type="hidden" name="shiftId" value={shiftId} />
          <CashCounter totalLabel={t("cashDrawer.counted")} error={errors.counts} />
          <Field label={t("cashDrawer.managerNote")} htmlFor="note" error={errors.note} required>
            <Textarea id="note" name="note" rows={2} maxLength={500} required />
          </Field>
          <ModalFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? t("cashDrawer.closing") : t("cashDrawer.forceClose")}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}

/** "Add drawer" button, or a pencil icon when editing, with its dialog. */
export function DrawerFormButton({
  drawer,
}: {
  drawer?: { id: string; name: string };
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { onSubmit, pending, errors } = useFormAction(saveDrawer, { onSuccess: () => setOpen(false) });
  return (
    <>
      {drawer ? (
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={t("common.edit")}>
          <Pencil />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus />
          {t("cashDrawer.addDrawer")}
        </Button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t(drawer ? "cashDrawer.editDrawer" : "cashDrawer.addDrawer")}
        size="sm"
      >
        <form onSubmit={onSubmit} className="grid gap-4">
          {drawer && <input type="hidden" name="id" value={drawer.id} />}
          <Field label={t("common.name")} htmlFor="drawer-name" error={errors.name} hint={t("cashDrawer.drawerNameHint")} required>
            <Input id="drawer-name" name="name" defaultValue={drawer?.name} maxLength={60} required autoFocus />
          </Field>
          <ModalFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("common.saving") : t("common.save")}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
