"use server";

import { requireAdminAction } from "@/lib/require-admin";
import { logActivity } from "@/lib/repositories/activity-logs";
import { getBorrowHistoryForExport } from "@/lib/repositories/borrowings";
import {
  periodRange,
  type ExportBorrow,
  type PeriodSpec,
} from "@/lib/reports/borrow-history-period";

export type ExportHistoryResult =
  | {
      ok: true;
      rows: ExportBorrow[];
      range: { label: string; coverText: string; fileName: string };
      scope: string;
      generatedAt: string;
    }
  | { ok: false; error: string };

const OFFICE_NAMES: Record<"sports_dev" | "culture_arts", string> = {
  sports_dev: "University Sports & Development Office",
  culture_arts: "University Culture and the Arts Office",
};

/**
 * Admin only. Checks the role and office on the server, returns every borrow
 * in the chosen period for the admin's office (all offices for a super admin),
 * and logs the export (D7). The PDF is built in the browser from these rows.
 */
export async function exportBorrowHistoryAction(spec: PeriodSpec): Promise<ExportHistoryResult> {
  const gate = await requireAdminAction("You are not allowed to export borrow history.");
  if (!gate.ok) return gate;
  const { caller } = gate;

  let range;
  try {
    range = periodRange(spec);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid period." };
  }

  const rows = await getBorrowHistoryForExport(caller.office, range.from, range.to);

  await logActivity({
    userId: caller.id,
    action: "history_exported",
    entityType: "borrow_record",
    entityId: null,
    description: `Exported ${range.label} borrow history (${rows.length} row(s)).`,
    office: caller.office,
  });

  return {
    ok: true,
    rows,
    range: { label: range.label, coverText: range.coverText, fileName: range.fileName },
    scope: caller.office ? OFFICE_NAMES[caller.office] : "All offices",
    generatedAt: new Date().toISOString(),
  };
}