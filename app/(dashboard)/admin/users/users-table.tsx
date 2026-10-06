"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Pencil, Plus, RotateCcw, UserMinus, UserPlus, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DataTable,
  StatusBadge,
  type DataTableColumn,
} from "@/components/shared/dashboard/data-table";
import { ConfirmDialog } from "@/components/shared/dashboard/confirm-dialog";
import { FormDialogShell } from "@/components/shared/dashboard/form-dialog";
import { FilterBar } from "@/components/shared/dashboard/filter-bar";
import {
  FormField,
  FIELD_FOCUS_RING_CLASSES,
} from "@/components/shared/dashboard/form-field";
import { COLLEGES, getOrganizations } from "@/data/colleges";
import {
  ID_NUMBER_LENGTH,
  ID_NUMBER_PLACEHOLDER,
  formatIdNumber,
  isValidIdNumber,
} from "@/lib/id-number";
import {
  CONTACT_NUMBER_LENGTH,
  CONTACT_NUMBER_PLACEHOLDER,
  CONTACT_NUMBER_PREFIX,
  formatContactNumber,
  isValidContactNumber,
} from "@/lib/contact-number";
import { cn } from "@/lib/utils";
import { formatLongDate } from "@/lib/dates";
import type { Office, Role, AdminType } from "@/lib/roles";
import { getAdminType, ADMIN_TYPE_LABELS } from "@/lib/roles";
import type { UserManagementRow } from "@/lib/repositories/users";
import {
  addUserAction,
  editUserAction,
  deactivateUserAction,
  reactivateUserAction,
  getLastPasswordChangeAtAction,
  type UserActionResult,
} from "./actions";

// ---------------------------------------------------------------------------
// Wired to the database (see MIGRATION_PLAN.md, admin_dashboard.php's
// userManagementSection / getUserManagementList()). Rows come from the server
// page (getUserManagementList()); Add / Edit / Deactivate / Reactivate call
// the Server Actions in ./actions.ts, which re-check that the caller is a
// super admin (this page is super-admin-only, like the PHP's
// `$adminOffice === null` gate — admin-layout hides the nav item for an SDO /
// UCAO admin and proxy.ts redirects them from /admin/users to /admin).
// Same shared DataTable shell as the borrower dashboard's tables and
// admin/items — see components/shared/dashboard/data-table.tsx.
//
// This table only ever shows approved accounts — pending sign-ups live in
// Sign-Up Requests instead, and rejected accounts aren't manageable at
// all, same exclusion the PHP's getUserManagementList() query already
// applies. Status badge is Active/Deactivated (derived from `deletedAt`,
// ported as `isDeactivated`), not the borrow-status enum, so it's passed
// through StatusBadge's `label` override rather than relying on the badge's
// own status-based default text.
//
// Office / College and Phone Number columns were removed from the table
// (2026-09-25): the new View User dialog already surfaces every field an
// admin might need to check per-row (Office/College, Email, Contact
// Number, Account Created, Last Password Update), so both columns became
// redundant. Name, ID Number, Role, Email, and Status remain, since Email
// stays useful for scanning/searching the list itself, unlike the two
// removed columns which existed mainly to expose data now better shown
// on demand via View.
//
// Add User and Edit User are both inlined directly in this file (their
// own form state, fields, and submit handling), built on the shared
// FormDialogShell (components/shared/dashboard/form-dialog.tsx) for
// just the dialog chrome — header/body-slot/footer — rather than as their
// own standalone dialog components (same pattern as admin/items/page.tsx).
// Add User is the shadcn/ui port of admin_dashboard.php's #addUserModal.
// Edit User is the port of #editUserModal, pre-filled from the clicked
// row (same field set as Add plus Email/Contact Number, both explicitly
// editable here per the PHP's own comments; New Password is optional,
// blank = unchanged). ID Number is editable too (SA-27: the PHP's
// #editUserModal allows this), enforced unique the same way as Email and
// Contact Number — excluding the row being edited — by updateUser().
//
// College/Organization options come from data/colleges.ts — the same
// hardcoded (on purpose, not a DB table) source the public sign-up form
// uses, mirroring the PHP's getCollegeOrganizations($conn) being one shared
// source for the sign-up form and these two admin forms. The dropdowns show
// CODES only, never the full names, and an organization is always paired
// with its college (an organization code is only unique within a college).
//
// Deactivate/Reactivate buttons swap per row (only one or the other ever
// shows, matching the PHP's `$isDeactivated` ? reactivate-form :
// deactivate-form branch). Deactivate routes through the shared
// ConfirmDialog (components/shared/dashboard/confirm-dialog.tsx) — the
// shadcn/AlertDialog port of admin_dashboard.php's shared
// #actionConfirmModal ("Deactivate User" / "Deactivate {name}'s account?
// They will no longer be able to sign in, but their borrow history is
// kept."). Reactivate is a direct click (no confirm — reversible, low risk).
// A super admin can't deactivate their own account (added on purpose, not in
// the PHP — see actions.ts); that row's Deactivate button is disabled with a
// tooltip explaining why.
// ---------------------------------------------------------------------------

type UserRole = Role;
type AdminOffice = Office;
type UserRow = UserManagementRow;

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  borrower: "Borrower",
};

/**
 * The Role dropdown's actual selectable values: "borrower" for a borrower,
 * or one of the three admin types. Selecting an admin type sets BOTH
 * `role: "admin"` and `office` in one step (office derived via
 * ADMIN_TYPE_TO_OFFICE below) — there is no separate "Office" field
 * anymore. This replaces the old two-step Role (Borrower/Admin) + Office
 * (Sports Development/University Culture & the Arts/blank=super) flow.
 */
type RoleSelectValue = "borrower" | AdminType;

const ROLE_SELECT_LABELS: Record<RoleSelectValue, string> = {
  borrower: "Borrower",
  super: ADMIN_TYPE_LABELS.super,
  sdo: ADMIN_TYPE_LABELS.sdo,
  ucao: ADMIN_TYPE_LABELS.ucao,
};

/** super -> no office (all offices); sdo/ucao -> their Office enum value. */
const ADMIN_TYPE_TO_OFFICE: Record<AdminType, AdminOffice | ""> = {
  super: "",
  sdo: "sports_dev",
  ucao: "culture_arts",
};

/** A row's role + office collapsed to one selector value, for pre-filling
 *  Edit User's Role dropdown and for deriving the table/View display label. */
function toRoleSelectValue(role: UserRole, office: AdminOffice | null): RoleSelectValue {
  if (role === "borrower") return "borrower";
  return getAdminType(office);
}

/** What the table's Role column and the View dialog show: "Borrower" as
 *  before, or the admin's specific type ("Super Admin" / "SDO Admin" /
 *  "UCAO Admin") instead of a flat "Admin" — so the three admin kinds are
 *  distinguishable without opening the row. */
function roleDisplayLabel(role: UserRole, office: AdminOffice | null): string {
  if (role === "borrower") return ROLE_LABELS.borrower;
  return ADMIN_TYPE_LABELS[getAdminType(office)];
}

/** Same initials logic as components/shared/dashboard/profile-dialog.tsx's
 *  getInitials, duplicated locally rather than imported/exported since it's
 *  a 2-line pure function and this file already inlines the rest of its
 *  own dialogs rather than pulling in profile-dialog's other pieces. */
function getViewInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

/** Read-only rendering of a field, styled to match this file's other
 *  FormField-wrapped inputs (Edit User) rather than ProfileDialog's
 *  separate ReadOnlyField, so View and Edit look like the same form. */
function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <FormField label={label}>
      <Input
        value={value || "—"}
        disabled
        readOnly
        className={cn(FIELD_FOCUS_RING_CLASSES, "disabled:opacity-100")}
      />
    </FormField>
  );
}

const ADD_USER_EMPTY = {
  idNumber: "",
  role: "borrower" as UserRole,
  firstName: "",
  lastName: "",
  email: "",
  contactNumber: CONTACT_NUMBER_PREFIX,
  office: "" as AdminOffice | "",
  college: "",
  organizationName: "",
  password: "",
};

export function UsersTable({
  users,
  currentUserId,
}: {
  users: UserRow[];
  /** The signed-in super admin's own id — disables their own Deactivate button. */
  currentUserId: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  // Inline error for the Add/Edit dialogs specifically — those stay open
  // on failure so the user can fix the form and resubmit, so their error
  // needs to render inside the still-open dialog, not just as a toast
  // that can appear behind/outside it. Delete/Deactivate/Reactivate close
  // their confirm dialog immediately regardless of outcome, so a toast
  // alone is enough for those.
  const [dialogError, setDialogError] = React.useState<string | null>(null);

  // Run a Server Action, toast its result, and refresh the table. Pass
  // `showInDialog: true` for an action whose dialog stays open on
  // failure (Add/Edit) so the error also renders inline there.
  function run(
    action: () => Promise<UserActionResult>,
    successMessage: string,
    onSuccess?: () => void,
    options?: { showInDialog?: boolean }
  ) {
    if (options?.showInDialog) setDialogError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        if (options?.showInDialog) setDialogError(result.error);
        router.refresh();
        return;
      }
      toast.success(successMessage);
      onSuccess?.();
      router.refresh();
    });
  }

  const [search, setSearch] = React.useState("");
  const [role, setRole] = React.useState<UserRole | "all">("all");
  // Row currently targeted by the Deactivate confirm dialog — mirrors the
  // PHP's per-form `data-name` read into the shared modal's message.
  const [deactivateTarget, setDeactivateTarget] = React.useState<UserRow | null>(null);

  // ---- Add User form state (inlined, was AddUserDialog) ----
  const [addUserOpen, setAddUserOpen] = React.useState(false);
  const [addIdNumber, setAddIdNumber] = React.useState(ADD_USER_EMPTY.idNumber);
  const [addRole, setAddRole] = React.useState<UserRole>(ADD_USER_EMPTY.role);
  const [addFirstName, setAddFirstName] = React.useState(ADD_USER_EMPTY.firstName);
  const [addLastName, setAddLastName] = React.useState(ADD_USER_EMPTY.lastName);
  const [addEmail, setAddEmail] = React.useState(ADD_USER_EMPTY.email);
  const [addContactNumber, setAddContactNumber] = React.useState(
    ADD_USER_EMPTY.contactNumber,
  );
  const [addOffice, setAddOffice] = React.useState<AdminOffice | "">(
    ADD_USER_EMPTY.office,
  );
  const [addCollege, setAddCollege] = React.useState(ADD_USER_EMPTY.college);
  const [addOrganizationName, setAddOrganizationName] = React.useState(
    ADD_USER_EMPTY.organizationName,
  );
  const [addPassword, setAddPassword] = React.useState(ADD_USER_EMPTY.password);
  const [showAddPassword, setShowAddPassword] = React.useState(false);

  const isAddAdmin = addRole === "admin";
  const addOrganizationOptions = getOrganizations(addCollege);
  /** The Role dropdown's current selector value — "borrower" or the admin
   *  type implied by addRole+addOffice, so the Select can show the right
   *  option without a separate Office field. */
  const addRoleSelectValue = toRoleSelectValue(addRole, addOffice || null);

  // Reset Add User's form every time it opens fresh. Done in the click
  // handler rather than an effect, so it runs once with no extra render.
  function openAddUser() {
    setAddIdNumber(ADD_USER_EMPTY.idNumber);
    setAddRole(ADD_USER_EMPTY.role);
    setAddFirstName(ADD_USER_EMPTY.firstName);
    setAddLastName(ADD_USER_EMPTY.lastName);
    setAddEmail(ADD_USER_EMPTY.email);
    setAddContactNumber(ADD_USER_EMPTY.contactNumber);
    setAddOffice(ADD_USER_EMPTY.office);
    setAddCollege(ADD_USER_EMPTY.college);
    setAddOrganizationName(ADD_USER_EMPTY.organizationName);
    setAddPassword(ADD_USER_EMPTY.password);
    setShowAddPassword(false);
    setDialogError(null);
    setAddUserOpen(true);
  }

  const isAddValid =
    isValidIdNumber(addIdNumber) &&
    addFirstName.trim().length > 0 &&
    addLastName.trim().length > 0 &&
    addEmail.trim().length > 0 &&
    isValidContactNumber(addContactNumber) &&
    addPassword.length > 0;

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAddValid) return;
    run(
      () =>
        addUserAction({
          idNumber: addIdNumber,
          role: addRole,
          firstName: addFirstName,
          lastName: addLastName,
          email: addEmail,
          contactNumber: addContactNumber,
          office: addOffice,
          college: addCollege,
          organizationName: addOrganizationName,
          password: addPassword,
        }),
      "User added",
      () => setAddUserOpen(false),
      { showInDialog: true }
    );
  };

  // ---- Edit User form state (inlined, was EditUserDialog) ----
  const [editTarget, setEditTarget] = React.useState<UserRow | null>(null);
  const [editIdNumber, setEditIdNumber] = React.useState("");
  const [editRole, setEditRole] = React.useState<UserRole>("borrower");
  const [editFirstName, setEditFirstName] = React.useState("");
  const [editLastName, setEditLastName] = React.useState("");
  const [editEmail, setEditEmail] = React.useState("");
  const [editContactNumber, setEditContactNumber] = React.useState("");
  const [editOffice, setEditOffice] = React.useState<AdminOffice | "">("");
  const [editCollege, setEditCollege] = React.useState("");
  const [editOrganizationName, setEditOrganizationName] = React.useState("");
  const [editNewPassword, setEditNewPassword] = React.useState("");
  const [showEditPassword, setShowEditPassword] = React.useState(false);

  const isEditAdmin = editRole === "admin";
  /** Same derivation as addRoleSelectValue, for Edit User's Role dropdown. */
  const editRoleSelectValue = toRoleSelectValue(editRole, editOffice || null);

  // ---- View User (read-only) ----
  // Reuses Edit User's field layout, but read-only, plus two fields Edit
  // doesn't show: Account Created (already on the row) and Last Password
  // Update (fetched lazily on open via getLastPasswordChangeAtAction, since
  // it isn't part of getUserManagementList()'s row — see actions.ts).
  const [viewTarget, setViewTarget] = React.useState<UserRow | null>(null);
  const [viewLastPasswordChangeAt, setViewLastPasswordChangeAt] =
    React.useState<string | null | undefined>(undefined); // undefined = loading
  const viewRequestIdRef = React.useRef(0);

  function openViewUser(row: UserRow) {
    setViewTarget(row);
    setViewLastPasswordChangeAt(undefined);

    const requestId = ++viewRequestIdRef.current;
    void getLastPasswordChangeAtAction(row.id).then((result) => {
      // Ignore a stale response if the dialog was reopened on another row
      // (or closed and reopened) before this one returned.
      if (viewRequestIdRef.current !== requestId) return;
      if (result.ok) {
        setViewLastPasswordChangeAt(result.lastPasswordChangeAt);
      } else {
        setViewLastPasswordChangeAt(null);
        toast.error(result.error);
      }
    });
  }
  const editOrganizationOptions = getOrganizations(editCollege);

  // Populate from the target row every time Edit User opens on a new row —
  // mirrors the PHP's edit-user-btn click handler reading dataset.* into
  // the modal's fields. Done in the click handler rather than an effect
  // (no extra render).
  function openEditUser(row: UserRow) {
    setEditIdNumber(row.idNumber);
    setEditRole(row.role);
    setEditFirstName(row.firstName);
    setEditLastName(row.lastName);
    setEditEmail(row.email ?? "");
    // Shown formatted ("0917 384 6215"); a number that is not a 09 number
    // (a legacy or placeholder value) is shown exactly as stored.
    setEditContactNumber(
      row.contactNumber && isValidContactNumber(row.contactNumber)
        ? formatContactNumber(row.contactNumber)
        : (row.contactNumber ?? ""),
    );
    setEditOffice(row.office ?? "");
    setEditCollege(row.college ?? "");
    setEditOrganizationName(row.organization ?? "");
    setEditNewPassword("");
    setShowEditPassword(false);
    setDialogError(null);
    setEditTarget(row);
  }

  // A NEW or CHANGED ID must be 000-0000; an untouched legacy ID still saves.
  const isEditValid =
    (isValidIdNumber(editIdNumber) || editIdNumber === editTarget?.idNumber) &&
    editFirstName.trim().length > 0 &&
    editLastName.trim().length > 0 &&
    editEmail.trim().length > 0 &&
    // A NEW or CHANGED number must be 09 + 9 digits; an untouched legacy one still saves.
    (isValidContactNumber(editContactNumber) ||
      editContactNumber === (editTarget?.contactNumber ?? ""));

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditValid || !editTarget) return;
    run(
      () =>
        editUserAction({
          id: editTarget.id,
          idNumber: editIdNumber,
          role: editRole,
          firstName: editFirstName,
          lastName: editLastName,
          email: editEmail,
          contactNumber: editContactNumber,
          office: editOffice,
          college: editCollege,
          organizationName: editOrganizationName,
          newPassword: editNewPassword,
        }),
      "User updated",
      () => setEditTarget(null),
      { showInDialog: true }
    );
  };

  const filteredUsers = users.filter((user) => {
    const matchesRole = role === "all" || user.role === role;
    const term = search.trim().toLowerCase();
    const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
    const matchesSearch =
      !term ||
      fullName.includes(term) ||
      user.idNumber.toLowerCase().includes(term);
    return matchesRole && matchesSearch;
  });

  const columns: DataTableColumn<UserRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (row) => `${row.firstName} ${row.lastName}`,
      title: (row) => `${row.firstName} ${row.lastName}`,
      className: "md:max-w-[180px] md:truncate",
    },
    {
      key: "idNumber",
      header: "ID Number",
      cell: (row) => row.idNumber,
    },
    {
      key: "role",
      header: "Role",
      cell: (row) => roleDisplayLabel(row.role, row.office),
    },
    {
      key: "email",
      header: "Email",
      cell: (row) => row.email ?? "—",
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <StatusBadge
          status={row.isDeactivated ? "unavailable" : "available"}
          label={row.isDeactivated ? "Deactivated" : "Active"}
          fixedWidth
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (row) => (
        <div className="flex justify-start gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                className="rounded-md! border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                onClick={() => openViewUser(row)}
              >
                <UserRound className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="border-none bg-green-700 text-gray-50 [&_.fill-foreground]:bg-green-700! [&_.fill-foreground]:fill-green-700!">View</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                className="rounded-md! border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                onClick={() => openEditUser(row)}
              >
                <Pencil className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="border-none bg-green-700 text-gray-50 [&_.fill-foreground]:bg-green-700! [&_.fill-foreground]:fill-green-700!">Edit</TooltipContent>
          </Tooltip>
          {row.isDeactivated ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  className="rounded-md! border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                  onClick={() => run(() => reactivateUserAction(row.id), "User reactivated")}
                >
                  <RotateCcw className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="border-none bg-green-700 text-gray-50 [&_.fill-foreground]:bg-green-700! [&_.fill-foreground]:fill-green-700!">Reactivate</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending || row.id === currentUserId}
                  className="rounded-md! border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => setDeactivateTarget(row)}
                >
                  <UserMinus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="border-none bg-green-700 text-gray-50 [&_.fill-foreground]:bg-green-700! [&_.fill-foreground]:fill-green-700!">
                {row.id === currentUserId ? "You can't deactivate yourself" : "Deactivate"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4">
        <h3 className="mb-1 text-lg font-semibold text-green-800">
          User Management
        </h3>
        <p className="mb-0 text-muted-foreground">
          Create, edit, and deactivate borrower and admin accounts.
        </p>
      </div>

      <FilterBar
        filters={[
          {
            value: role,
            onValueChange: (value) => setRole(value as UserRole | "all"),
            options: [
              { value: "all", label: "All Users" },
              { value: "admin", label: "Admin" },
              { value: "borrower", label: "Borrower" },
            ],
            placeholder: "All Users",
            widthClassName: "sm:w-40",
          },
        ]}
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Search users...",
        }}
        actions={[
          <Button
            key="add-user"
            type="button"
            disabled={isPending}
            className="shrink-0 rounded-md! bg-green-600 font-semibold hover:bg-green-700"
            onClick={openAddUser}
          >
            <Plus className="size-4" />
            Add User
          </Button>,
        ]}
      />

      <div className="rounded-2xl bg-white p-2 shadow-md md:p-4">
        <DataTable
          columns={columns}
          rows={filteredUsers}
          getRowId={(row) => row.id}
          emptyMessage="No users found."
        />
      </div>

      {/* Add User — shadcn/ui port of admin_dashboard.php's #addUserModal. */}
      <FormDialogShell
        open={addUserOpen}
        onOpenChange={setAddUserOpen}
        title="Add User"
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2 px-5 py-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-md!"
              onClick={() => setAddUserOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="add-user-form"
              disabled={!isAddValid || isPending}
              className="rounded-md! bg-green-600 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserPlus className="size-4" />
              Add User
            </Button>
          </div>
        }
      >
        <form id="add-user-form" onSubmit={handleAddSubmit}>
          <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-4">
            {dialogError && (
              <p
                role="alert"
                className="mb-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {dialogError}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FormField label="ID Number">
                <Input
                  value={addIdNumber}
                  onChange={(e) => setAddIdNumber(formatIdNumber(e.target.value))}
                  placeholder={ID_NUMBER_PLACEHOLDER}
                  inputMode="numeric"
                  maxLength={ID_NUMBER_LENGTH}
                  className={FIELD_FOCUS_RING_CLASSES}
                  required
                />
              </FormField>
              <FormField label="Role">
                <Select
                  value={addRoleSelectValue}
                  onValueChange={(value) => {
                    const next = (value as RoleSelectValue) ?? addRoleSelectValue;
                    if (next === "borrower") {
                      setAddRole("borrower");
                      setAddOffice("");
                    } else {
                      setAddRole("admin");
                      setAddOffice(ADMIN_TYPE_TO_OFFICE[next]);
                      // Same stale-state guard as before: an admin has no
                      // College/Organization fields.
                      setAddCollege("");
                      setAddOrganizationName("");
                    }
                  }}
                >
                  <SelectTrigger className={cn("w-full bg-white", FIELD_FOCUS_RING_CLASSES)}>
                    <SelectValue>{ROLE_SELECT_LABELS[addRoleSelectValue]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    sideOffset={4}
                    className="w-full"
                    style={{ width: "var(--anchor-width)" }}
                  >
                    <SelectItem value="borrower">Borrower</SelectItem>
                    <SelectItem value="super">{ADMIN_TYPE_LABELS.super}</SelectItem>
                    <SelectItem value="sdo">{ADMIN_TYPE_LABELS.sdo}</SelectItem>
                    <SelectItem value="ucao">{ADMIN_TYPE_LABELS.ucao}</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="First Name">
                <Input
                  value={addFirstName}
                  onChange={(e) => setAddFirstName(e.target.value)}
                  className={FIELD_FOCUS_RING_CLASSES}
                  required
                />
              </FormField>
              <FormField label="Last Name">
                <Input
                  value={addLastName}
                  onChange={(e) => setAddLastName(e.target.value)}
                  className={FIELD_FOCUS_RING_CLASSES}
                  required
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Email">
                <Input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  className={FIELD_FOCUS_RING_CLASSES}
                  required
                />
              </FormField>
              <FormField label="Contact Number">
                <Input
                  type="tel"
                  value={addContactNumber}
                  onChange={(e) =>
                    setAddContactNumber(formatContactNumber(e.target.value))
                  }
                  placeholder={CONTACT_NUMBER_PLACEHOLDER}
                  inputMode="numeric"
                  maxLength={CONTACT_NUMBER_LENGTH}
                  className={FIELD_FOCUS_RING_CLASSES}
                  required
                />
              </FormField>
            </div>

            {!isAddAdmin && (
              <div className="grid grid-cols-2 gap-3">
                <FormField label="College">
                  <Select
                    value={addCollege}
                    onValueChange={(value) => {
                      setAddCollege(value ?? "");
                      setAddOrganizationName("");
                    }}
                  >
                    <SelectTrigger className={cn("w-full bg-white", FIELD_FOCUS_RING_CLASSES)}>
                      <SelectValue placeholder="Select college" />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      sideOffset={4}
                      className="w-full"
                      style={{ width: "var(--anchor-width)" }}
                    >
                      {COLLEGES.map((college) => (
                        <SelectItem key={college.code} value={college.code}>
                          {college.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Organization">
                  <Select
                    value={addOrganizationName}
                    onValueChange={(value) => setAddOrganizationName(value ?? "")}
                    disabled={!addCollege}
                  >
                    <SelectTrigger
                      className={cn(
                        "w-full bg-white disabled:opacity-60",
                        FIELD_FOCUS_RING_CLASSES,
                      )}
                    >
                      <SelectValue
                        placeholder={
                          addCollege
                            ? "Select organization"
                            : "Select college first"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      sideOffset={4}
                      className="w-full"
                      style={{ width: "var(--anchor-width)" }}
                    >
                      {addOrganizationOptions.map((organization) => (
                        <SelectItem key={organization.code} value={organization.code}>
                          {organization.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
            )}

            <FormField label="Password">
              <div className="relative">
                <Input
                  type={showAddPassword ? "text" : "password"}
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  className={cn("pr-10", FIELD_FOCUS_RING_CLASSES)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowAddPassword((v) => !v)}
                  aria-label={showAddPassword ? "Hide password" : "Show password"}
                  aria-pressed={showAddPassword}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 hover:text-slate-700"
                >
                  {showAddPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                A welcome email is sent to the email address above. It does not
                include the password, so give the password to the user
                directly.
              </p>
            </FormField>
          </div>
        </form>
      </FormDialogShell>

      {/* Edit User — shadcn/ui port of admin_dashboard.php's #editUserModal. */}
      <FormDialogShell
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        title="Edit User"
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2 px-5 py-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-md!"
              onClick={() => setEditTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-user-form"
              disabled={!isEditValid || isPending}
              className="rounded-md! bg-green-600 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save Changes
            </Button>
          </div>
        }
      >
        <form id="edit-user-form" onSubmit={handleEditSubmit}>
          <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-4">
            {dialogError && (
              <p
                role="alert"
                className="mb-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {dialogError}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FormField label="ID Number">
                <Input
                  value={editIdNumber}
                  onChange={(e) => setEditIdNumber(formatIdNumber(e.target.value))}
                  placeholder={ID_NUMBER_PLACEHOLDER}
                  inputMode="numeric"
                  maxLength={ID_NUMBER_LENGTH}
                  className={cn("bg-white", FIELD_FOCUS_RING_CLASSES)}
                />
              </FormField>
              <FormField label="Role">
                <Select
                  value={editRoleSelectValue}
                  onValueChange={(value) => {
                    const next = (value as RoleSelectValue) ?? editRoleSelectValue;
                    if (next === "borrower") {
                      setEditRole("borrower");
                      setEditOffice("");
                    } else {
                      setEditRole("admin");
                      setEditOffice(ADMIN_TYPE_TO_OFFICE[next]);
                      // Same stale-state guard as before: an admin has no
                      // College/Organization fields.
                      setEditCollege("");
                      setEditOrganizationName("");
                    }
                  }}
                >
                  <SelectTrigger className={cn("w-full bg-white", FIELD_FOCUS_RING_CLASSES)}>
                    <SelectValue>{ROLE_SELECT_LABELS[editRoleSelectValue]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    sideOffset={4}
                    className="w-full"
                    style={{ width: "var(--anchor-width)" }}
                  >
                    <SelectItem value="borrower">Borrower</SelectItem>
                    <SelectItem value="super">{ADMIN_TYPE_LABELS.super}</SelectItem>
                    <SelectItem value="sdo">{ADMIN_TYPE_LABELS.sdo}</SelectItem>
                    <SelectItem value="ucao">{ADMIN_TYPE_LABELS.ucao}</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="First Name">
                <Input
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  className={FIELD_FOCUS_RING_CLASSES}
                  required
                />
              </FormField>
              <FormField label="Last Name">
                <Input
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  className={FIELD_FOCUS_RING_CLASSES}
                  required
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Email">
                <Input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className={FIELD_FOCUS_RING_CLASSES}
                  required
                />
              </FormField>
              <FormField label="Contact Number">
                <Input
                  type="tel"
                  value={editContactNumber}
                  // Masked once edited. An untouched legacy value never fires
                  // onChange, so it stays exactly as stored. No `pattern` here on
                  // purpose: the browser would block saving that untouched value.
                  onChange={(e) =>
                    setEditContactNumber(formatContactNumber(e.target.value))
                  }
                  placeholder={CONTACT_NUMBER_PLACEHOLDER}
                  inputMode="numeric"
                  maxLength={CONTACT_NUMBER_LENGTH}
                  className={FIELD_FOCUS_RING_CLASSES}
                  required
                />
              </FormField>
            </div>

            {!isEditAdmin && (
              <div className="grid grid-cols-2 gap-3">
                <FormField label="College">
                  <Select
                    value={editCollege}
                    onValueChange={(value) => {
                      setEditCollege(value ?? "");
                      setEditOrganizationName("");
                    }}
                  >
                    <SelectTrigger className={cn("w-full bg-white", FIELD_FOCUS_RING_CLASSES)}>
                      <SelectValue placeholder="Select college" />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      sideOffset={4}
                      className="w-full"
                      style={{ width: "var(--anchor-width)" }}
                    >
                      {COLLEGES.map((college) => (
                        <SelectItem key={college.code} value={college.code}>
                          {college.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Organization">
                  <Select
                    value={editOrganizationName}
                    onValueChange={(value) => setEditOrganizationName(value ?? "")}
                    disabled={!editCollege}
                  >
                    <SelectTrigger
                      className={cn(
                        "w-full bg-white disabled:opacity-60",
                        FIELD_FOCUS_RING_CLASSES,
                      )}
                    >
                      <SelectValue
                        placeholder={
                          editCollege
                            ? "Select organization"
                            : "Select college first"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      sideOffset={4}
                      className="w-full"
                      style={{ width: "var(--anchor-width)" }}
                    >
                      {editOrganizationOptions.map((organization) => (
                        <SelectItem key={organization.code} value={organization.code}>
                          {organization.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
            )}

            <FormField label="New Password">
              <div className="relative">
                <Input
                  type={showEditPassword ? "text" : "password"}
                  value={editNewPassword}
                  onChange={(e) => setEditNewPassword(e.target.value)}
                  placeholder="Leave blank to keep current password"
                  autoComplete="new-password"
                  className={cn("pr-10", FIELD_FOCUS_RING_CLASSES)}
                />
                <button
                  type="button"
                  onClick={() => setShowEditPassword((v) => !v)}
                  aria-label={
                    showEditPassword ? "Hide password" : "Show password"
                  }
                  aria-pressed={showEditPassword}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 hover:text-slate-700"
                >
                  {showEditPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave blank to keep the current password. If you set a new one,
                the user is emailed that their password was reset (the email
                does not include the password), so give them the new password
                directly.
              </p>
            </FormField>
          </div>
        </form>
      </FormDialogShell>

      {/* View User — read-only. Header copies ProfileDialog's avatar +
          name layout (components/shared/dashboard/profile-dialog.tsx),
          with role as the subtitle instead of email (email is already one
          of the read-only fields below, role is the more useful at-a-glance
          detail here). FormDialogShell's header only supports an icon chip
          or a plain title — no avatar slot — so this dialog is built
          directly on Dialog/DialogContent, the same primitives both
          ProfileDialog and FormDialogShell are built on, rather than
          stretching FormDialogShell to do something it wasn't designed
          for. Body below the header still mirrors Edit User's field
          layout and order, plus Account Created and Last Password Update;
          see openViewUser for how the latter is fetched. */}
      <Dialog
        open={viewTarget !== null}
        onOpenChange={(open) => {
          if (!open) setViewTarget(null);
        }}
      >
        <DialogContent className="max-w-2xl! gap-0 border-0 p-0 shadow-md">
          {viewTarget && (
            <>
              <div className="flex items-center gap-3 px-5 py-4">
                <Avatar className="size-10 shrink-0">
                  <AvatarFallback className="bg-green-700 text-sm font-semibold text-gray-50">
                    {getViewInitials(
                      `${viewTarget.firstName} ${viewTarget.lastName}`
                    )}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <DialogTitle className="truncate text-base font-semibold text-slate-900">
                    {`${viewTarget.firstName} ${viewTarget.lastName}`.trim() ||
                      "User"}
                  </DialogTitle>
                  <DialogDescription className="truncate text-sm text-muted-foreground">
                    {roleDisplayLabel(viewTarget.role, viewTarget.office)}
                  </DialogDescription>
                </div>
              </div>

              <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <ReadOnlyField label="ID Number" value={viewTarget.idNumber} />
                  <ReadOnlyField
                    label="Role"
                    value={roleDisplayLabel(viewTarget.role, viewTarget.office)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <ReadOnlyField label="Email" value={viewTarget.email ?? ""} />
                  <ReadOnlyField
                    label="Contact Number"
                    value={
                      viewTarget.contactNumber
                        ? formatContactNumber(viewTarget.contactNumber)
                        : ""
                    }
                  />
                </div>

                {viewTarget.role === "borrower" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <ReadOnlyField label="College" value={viewTarget.college ?? ""} />
                    <ReadOnlyField
                      label="Organization"
                      value={viewTarget.organization ?? ""}
                    />
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-3">
                  <ReadOnlyField
                    label="Account Created"
                    value={formatLongDate(viewTarget.createdAt, "—")}
                  />
                  <ReadOnlyField
                    label="Last Password Update"
                    value={
                      viewLastPasswordChangeAt === undefined
                        ? "Loading…"
                        : formatLongDate(viewLastPasswordChangeAt, "Never")
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-md!"
                  onClick={() => setViewTarget(null)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  className="rounded-md! bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    // Switch straight from View to Edit on the same user,
                    // closing View first so the two dialogs never overlap.
                    const target = viewTarget;
                    setViewTarget(null);
                    openEditUser(target);
                  }}
                >
                  <Pencil className="size-4" />
                  Edit
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
        title="Deactivate User"
        description={
          deactivateTarget
            ? `Deactivate ${deactivateTarget.firstName} ${deactivateTarget.lastName}'s account? They will no longer be able to sign in, but their borrow history is kept.`
            : ""
        }
        confirmLabel="Deactivate"
        variant="danger"
        onConfirm={() => {
          if (deactivateTarget) {
            run(() => deactivateUserAction(deactivateTarget.id), "User deactivated");
          }
          setDeactivateTarget(null);
        }}
      />
    </div>
  );
}