import { getInventoryList } from "@/lib/repositories/inventory";
import { ItemsEquipmentView } from "./items-equipment-view";

// Port of index.php's #borrowItemsSection (getInventoryList($conn, 'name')).
// Reads the inventory from the database on every request, so an item an admin
// adds, renames or marks unavailable shows up without a rebuild.
//
// Public, browse-only: no session check. The whole catalog is shown to
// everyone, every office's items, as on the PHP's public page.
export const dynamic = "force-dynamic";

export default async function ItemsEquipmentPage() {
  const items = await getInventoryList();
  return <ItemsEquipmentView items={items} />;
}