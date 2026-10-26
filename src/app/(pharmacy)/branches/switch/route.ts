import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { canSwitchBranch } from "@/lib/active-branch";
import { BRANCH_COOKIE, requirePharmacy } from "@/lib/auth";

/**
 * GET /branches/switch?to=<branchId>&next=/sales/<id>: makes another branch
 * the admin's working branch, then opens `next`. Lets the "All branches"
 * dashboard and notifications link to a record of another branch, whose pages
 * only show the current branch. Requests from other sites are ignored, so a
 * link elsewhere cannot switch an admin's branch behind their back.
 */
export async function GET(request: NextRequest) {
  const { user, branches } = await requirePharmacy({ allowInactive: true });
  const to = request.nextUrl.searchParams.get("to");
  const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";
  // Only paths on this site: "/x" but not "//host" or "/\host".
  const target = /^\/(?![/\\])/.test(next) ? next : "/dashboard";

  const crossSite = request.headers.get("sec-fetch-site") === "cross-site";
  const branch = branches.find((b) => b.id === to);
  if (canSwitchBranch(user) && branch && !crossSite) {
    (await cookies()).set(BRANCH_COOKIE, branch.id, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: true,
    });
  }
  return NextResponse.redirect(new URL(target, request.url));
}
