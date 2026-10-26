"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useT } from "@/i18n/client";
import type { ActionState } from "@/lib/action";
import { Button } from "./button";
import { Modal, ModalFooter } from "./modal";

type ConfirmOptions = {
  action: () => Promise<ActionState>;
  /** Dialog heading; defaults to the generic "delete this record?" wording. */
  title?: string;
  body?: string;
  confirmLabel?: string;
  /** Label of the button that closes the dialog without acting. */
  cancelLabel?: string;
  destructive?: boolean;
  onSuccess?: () => void;
};

/**
 * Confirmation dialog that runs a server action when confirmed. Use it
 * directly when something else opens it (a menu item); otherwise use
 * ConfirmButton.
 */
export function ConfirmDialog({
  open,
  onClose,
  action,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = true,
  onSuccess,
}: ConfirmOptions & { open: boolean; onClose: () => void }) {
  const t = useT();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await action();
      if (result?.ok) {
        if (result.message) toast.success(result.message);
        onClose();
        onSuccess?.();
      } else {
        toast.error(result?.message ?? t("common.somethingWrong"));
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={title ?? t("common.confirmDeleteTitle")} size="sm">
      <p className="text-sm text-muted-foreground">{body ?? t("common.confirmDeleteBody")}</p>
      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          {cancelLabel ?? t("common.cancel")}
        </Button>
        <Button variant={destructive ? "destructive" : "primary"} onClick={run} disabled={pending}>
          {confirmLabel ?? t("common.delete")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/**
 * Button that asks for confirmation before running a server action, e.g.
 *   <ConfirmButton action={() => deleteSupplier(id)} variant="ghost" size="icon">
 *     <Trash2 />
 *   </ConfirmButton>
 * An icon-only button gets its `aria-label` as tooltip.
 */
export function ConfirmButton({
  action,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive,
  onSuccess,
  children,
  ...buttonProps
}: Omit<React.ComponentProps<typeof Button>, "onClick"> & ConfirmOptions) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button {...buttonProps} title={buttonProps["aria-label"]} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        action={action}
        title={title}
        body={body}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        destructive={destructive}
        onSuccess={onSuccess}
      />
    </>
  );
}
