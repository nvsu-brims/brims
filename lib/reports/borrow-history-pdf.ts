// Borrow history PDF (Plan 5). Runs in the browser after the server action has
// checked the admin's role and office, logged the export, and returned the rows.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatManilaDateTime, type ExportBorrow } from "./borrow-history-period";

export interface BorrowHistoryPdfInput {
  rows: ExportBorrow[];
  range: { label: string; coverText: string; fileName: string };
  scope: string;
  generatedAt: string;
}

const OFFICE_LABELS: Record<string, string> = {
  sports_dev: "University Sports & Development Office",
  culture_arts: "University Culture and the Arts Office",
};
const STATUS_ORDER: [string, string][] = [
  ["Pending", "pending"],
  ["Borrowed", "borrowed"],
  ["Overdue", "overdue"],
  ["Returned", "returned"],
  ["Rejected", "rejected"],
  ["Cancelled", "cancelled"],
];
const UNITS_OUT = ["borrowed", "overdue", "returned"];
const GREEN: [number, number, number] = [22, 101, 52];

type WithLastTable = { lastAutoTable: { finalY: number } };

export function buildBorrowHistoryPdf(input: BorrowHistoryPdfInput): jsPDF {
  const { rows, range, scope, generatedAt } = input;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Title block
  doc.setFontSize(15);
  doc.setTextColor(...GREEN);
  doc.text("Borrow History Report", 10, 15);
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text(`Period: ${range.label}`, 10, 21);
  doc.text(`${range.coverText}. Scope: ${scope}.`, 10, 26);
  doc.text(`Generated: ${formatManilaDateTime(generatedAt)} (Manila)`, 10, 31);
  doc.setTextColor(180, 40, 40);
  doc.text("Contains personal data. Restricted to authorised administrators.", pageWidth - 10, 31, { align: "right" });

  // Summary: status counts and units
  const depositSum = rows.reduce((sum, r) => sum + (r.depositTotal ?? 0), 0);
  const depositTotalText = "PHP " + depositSum.toFixed(2);
  const statusRows = STATUS_ORDER.map(([label, key]) => [label, String(rows.filter((r) => r.status === key).length)]);
  const unitsOut = rows
    .filter((r) => UNITS_OUT.includes(r.status))
    .reduce((sum, r) => sum + r.quantity, 0);
  const conditionCount = (word: string) =>
    rows.reduce((sum, r) => sum + r.unitConditions.filter((c) => c === word).length, 0);

  autoTable(doc, {
    startY: 36,
    head: [["Summary", "Count"]],
    body: [
      ["Borrow requests in period", String(rows.length)],
      ...statusRows,
      ["Units borrowed (borrowed, overdue, returned)", String(unitsOut)],
      ["Units returned Good", String(conditionCount("good"))],
      ["Units returned Damaged", String(conditionCount("damaged"))],
      ["Units returned Lost", String(conditionCount("lost"))],
      ["Cash deposits recorded (PHP)", depositTotalText],
    ],
    theme: "grid",
    headStyles: { fillColor: GREEN },
    styles: { fontSize: 8, cellPadding: 1.5 },
    tableWidth: 110,
    margin: { left: 10 },
  });

  // Totals per office
  let y = (doc as unknown as WithLastTable).lastAutoTable.finalY + 6;
  const officeKeys = Array.from(new Set(rows.map((r) => r.itemOffice)));
  autoTable(doc, {
    startY: y,
    head: [["Office", "Borrow requests", "Units borrowed"]],
    body: officeKeys.map((office) => {
      const inOffice = rows.filter((r) => r.itemOffice === office);
      const units = inOffice
        .filter((r) => UNITS_OUT.includes(r.status))
        .reduce((sum, r) => sum + r.quantity, 0);
      return [OFFICE_LABELS[office] ?? office, String(inOffice.length), String(units)];
    }),
    theme: "grid",
    headStyles: { fillColor: GREEN },
    styles: { fontSize: 8, cellPadding: 1.5 },
    tableWidth: 150,
    margin: { left: 10 },
  });

  // Ten most borrowed items (units)
  y = (doc as unknown as WithLastTable).lastAutoTable.finalY + 6;
  const unitsByItem = new Map<string, number>();
  for (const r of rows) {
    if (!UNITS_OUT.includes(r.status)) continue;
    unitsByItem.set(r.itemName, (unitsByItem.get(r.itemName) ?? 0) + r.quantity);
  }
  const topItems = Array.from(unitsByItem.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  autoTable(doc, {
    startY: y,
    head: [["Most borrowed items (top 10)", "Units"]],
    body: topItems.length ? topItems.map(([name, units]) => [name, String(units)]) : [["No units borrowed in this period", "0"]],
    theme: "grid",
    headStyles: { fillColor: GREEN },
    styles: { fontSize: 8, cellPadding: 1.5 },
    tableWidth: 110,
    margin: { left: 10 },
  });

  // Detail: one row per borrow, blank where nothing is recorded (D1)
  doc.addPage();
  doc.setFontSize(11);
  doc.setTextColor(...GREEN);
  doc.text("Detail", 10, 14);
  autoTable(doc, {
    startY: 18,
    head: [[
      "Requested", "Approved", "Due", "Returned", "Borrower", "ID number", "College",
      "Organization", "Contact", "Email", "Item", "Office", "Units", "Status", "Approved by", "Deposit", "Unit conditions",
    ]],
    body: rows.map((r) => [
      formatManilaDateTime(r.requestedAt),
      formatManilaDateTime(r.approvedAt),
      formatManilaDateTime(r.dueAt),
      formatManilaDateTime(r.returnedAt),
      r.borrowerName,
      r.idNumber,
      r.college ?? "",
      r.organization ?? "",
      r.contactNumber ?? "",
      r.email ?? "",
      r.itemName,
      OFFICE_LABELS[r.itemOffice] ?? r.itemOffice,
      String(r.quantity),
      r.status,
      r.approvedByName ?? "",
      r.depositTotal == null ? "" : "PHP " + r.depositTotal.toFixed(2),
      r.unitConditions.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(", "),
    ]),
    theme: "striped",
    headStyles: { fillColor: GREEN, fontSize: 7 },
    styles: { fontSize: 7, cellPadding: 1.2, overflow: "linebreak" },
    margin: { left: 8, right: 8 },
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(90, 90, 90);
      doc.text(`${range.label} · Page ${page}`, 8, doc.internal.pageSize.getHeight() - 5);
    },
  });

  return doc;
}