import type { MessageKey } from "@/i18n/messages";

/*
 * Pharmacy roles and their labels. Client-safe. An admin runs the whole
 * pharmacy; a manager works in one branch and runs its cash drawers; staff
 * work in one branch.
 */

export type PharmacyRole = "admin" | "manager" | "staff";

export const ROLE_LABEL: Record<PharmacyRole, MessageKey> = {
  admin: "users.roleAdmin",
  manager: "users.roleManager",
  staff: "users.roleStaff",
};
