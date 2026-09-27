import Link from "next/link";
import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getPublicItemStats,
  type ItemCategory,
} from "@/lib/repositories/inventory";

// The two stat cards count the inventory table on every request (index.php's
// inline query against ucao_sdo_inventory), so they never go stale. Without
// this the page would be prerendered once at build time and freeze the
// numbers.
export const dynamic = "force-dynamic";

// A public landing page should still load if the database is unreachable, so
// a failed count shows 0 instead of an error page. The failure is logged.
async function getItemStats() {
  try {
    const stats = await getPublicItemStats();
    return stats;
  } catch (error) {
    console.error("Could not load the home page item stats:", error);
    return { availableCount: 0, totalItemsCount: 0 };
  }
}

// BUG-18 fix: these badges used to be their own hardcoded copy ("Sports
// Items & Equipment" / "Performing Arts Items & Equipment"), which drifted
// from the catalog's real labels ("SDO Items & Equipment" / "UCAO Items &
// Equipment", from CATEGORY_LABELS in the catalog views). Deriving the list
// from the same ItemCategory union the catalog uses means there is one
// source of truth and this can't go stale again.
const CATEGORY_LABELS: Record<ItemCategory, string> = {
  sports_dev_items_equipment: "SDO Items & Equipment",
  culture_arts_items_equipment: "UCAO Items & Equipment",
};

const CATEGORIES = Object.values(CATEGORY_LABELS);

export default async function HomePage() {
  const { availableCount, totalItemsCount } = await getItemStats();

  return (
    <div
      className="relative flex flex-1 items-center overflow-hidden bg-green-700 min-h-[calc(100dvh-64px)]"
    >
      {/* Decorative circles — same translucent tint as the stat cards */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 -left-16 hidden size-64 rounded-full bg-white/10 md:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-1/2 hidden size-96 -translate-y-1/2 rounded-full bg-white/10 md:block"
      />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-12 md:px-5">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
          <div>
            <h1 className="mb-3 text-[clamp(1.75rem,4.6vw,2.5rem)] font-bold text-gray-50">
              Welcome to NVSU-BRIMS
            </h1>
            <p className="mb-8 max-w-[46ch] text-[clamp(0.9rem,1.85vw,1.05rem)] text-white/85">
              The official platform for borrowing and returning items and
              equipment from the Sports Development Office and the
              University Culture and the Arts Office — Nueva Vizcaya State
              University Borrowing and Returning Items &amp; Equipment
              Management System.
            </p>
            <div className="flex flex-row flex-wrap gap-3">
              <Link
                href="/sign-in"
                className={cn(
                  buttonVariants(),
                  "flex-1 rounded-lg bg-gray-50 px-6 py-2.5 text-base font-semibold text-green-700 hover:bg-gray-50/90 sm:flex-none lg:px-8 lg:py-5"
                )}
              >
                Get Started
              </Link>
              <Link
                href="/items-equipment"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "flex-1 rounded-lg border-white/70 bg-transparent px-6 py-2.5 text-base font-semibold text-gray-50 hover:bg-gray-50 hover:text-green-700 sm:flex-none lg:px-8 lg:py-5"
                )}
              >
                <span className="sm:hidden">Browse</span>
                <span className="hidden sm:inline">
                  Browse Items &amp; Equipment
                </span>
              </Link>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md md:p-5">
                <h3 className="mb-1 text-[clamp(1.35rem,4.5vw,2rem)] leading-none font-bold text-gray-50">
                  {availableCount}
                </h3>
                <p className="mb-0 text-sm text-white/80">
                  Available Items &amp; Equipment
                </p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md md:p-5">
                <h3 className="mb-1 text-[clamp(1.35rem,4.5vw,2rem)] leading-none font-bold text-gray-50">
                  {totalItemsCount}
                </h3>
                <p className="mb-0 text-sm text-white/80">
                  Total Items &amp; Equipment
                </p>
              </div>

              <div className="col-span-2 hidden rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md md:block md:p-5">
                <p className="mb-2 text-xs font-semibold text-gray-50">
                  Categories
                </p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((category) => (
                    <Badge
                      key={category}
                      className="rounded-full bg-gray-50 px-3 py-1 font-semibold text-green-700 hover:bg-gray-50"
                    >
                      {category}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="col-span-2 flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md md:p-5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <Clock className="size-5 text-gray-50" />
                </div>
                <div>
                  <p className="mb-1 text-sm font-semibold text-gray-50">
                    Need help? Visit SDO or UCAO
                  </p>
                  <p className="mb-0 text-sm text-white/80">
                    Mon–Fri, 8:00 AM–12:00 PM &amp; 1:00 PM–5:00 PM
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}