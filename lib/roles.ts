// Role / office helpers shared by sign-in, the session, and proxy.ts. No
// auth-library or database imports, so it can run anywhere including the edge.

export type Role = "borrower" | "admin";
export type Office = "sports_dev" | "culture_arts";

/** `office` null = super admin (all offices); otherwise SDO or UCAO. Borrowers have no office. */
export type AdminType = "super" | "sdo" | "ucao";

export function getAdminType(office: Office | null): AdminType {
  switch (office) {
    case "sports_dev":
      return "sdo";
    case "culture_arts":
      return "ucao";
    default:
      return "super";
  }
}

/** Full office names, e.g. for the scoped admin's profile "Office" field. */
export const OFFICE_LABELS: Record<Office, string> = {
  sports_dev: "Sports Development Office",
  culture_arts: "University Culture & the Arts Office",
};

/** Label shown in the dashboard greeting: "Welcome, SDO Admin". */
export const ADMIN_TYPE_LABELS: Record<AdminType, string> = {
  super: "Super Admin",
  sdo: "SDO Admin",
  ucao: "UCAO Admin",
};

export function getAdminLabel(office: Office | null): string {
  return ADMIN_TYPE_LABELS[getAdminType(office)];
}

/**
 * True only for an explicit `office === null` (super admin). `undefined`
 * (session not loaded yet) is deliberately NOT a super admin, so nothing
 * briefly flashes the full view before the session resolves.
 */
export function isSuperAdmin(office: Office | null | undefined): boolean {
  return office === null;
}

/** Admin routes only the super admin may open; proxy.ts redirects scoped admins to /admin. */
export const SUPER_ADMIN_ONLY_PATHS = [
  "/admin/users",
  "/admin/sign-up-requests",
] as const;

// All admin types go to /admin today (one dashboard, session decides view).
export const ADMIN_DASHBOARD_PATHS: Record<AdminType, string> = {
  super: "/admin",
  sdo: "/admin",
  ucao: "/admin",
};

export const BORROWER_DASHBOARD_PATH = "/borrower";

/** Role check first, then admin type: the path to redirect a user to. */
export function getDashboardPath(user: {
  role: Role;
  office: Office | null;
}): string {
  if (user.role === "admin") {
    return ADMIN_DASHBOARD_PATHS[getAdminType(user.office)];
  }
  return BORROWER_DASHBOARD_PATH;
}