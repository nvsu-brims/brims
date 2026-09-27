import { requireBorrowerId } from "@/lib/require-borrower";
import {
  getInventoryList,
  getUserPendingItemIds,
} from "@/lib/repositories/inventory";
import { CatalogView } from "./catalog-view";

// Port of borrower_dashboard.php's borrowItemsSection:
//   $result = getInventoryList($conn, 'newest');
//   $userPendingItemIds = getUserPendingItemIds($conn, $currentUserId);
// Reads the inventory from the database on every request, so an item an admin
// adds, renames or marks unavailable shows up without a rebuild.
//
// No office argument: borrowers always see every office's items (as in the
// PHP). Which items THIS borrower already has a pending request on is looked
// up for the signed-in user only, so it never changes what other borrowers see.
// Submit Request in the dialog creates a real pending borrow_records row
// (submitBorrowRequestAction in ./actions.ts), so a card flips to "Request
// Pending" right after a successful submit.
export const dynamic = "force-dynamic";

export default async function BorrowerCatalogPage() {
  const borrowerId = await requireBorrowerId();
  const [inventory, pendingItemIds] = await Promise.all([
    getInventoryList(undefined, "newest"),
    getUserPendingItemIds(borrowerId),
  ]);

  const pendingIdSet = new Set(pendingItemIds);
  const items = inventory.map((item) => ({
    ...item,
    hasPendingRequest: pendingIdSet.has(item.id),
  }));

  return <CatalogView items={items} />;
}