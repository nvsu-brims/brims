import * as React from "react";
import { Archive, Search, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

// ---------------------------------------------------------------------------
// Shared, branded empty state — used by (public), admin and borrower pages,
// so it lives at components/shared/empty-state.tsx rather than under
// shared/dashboard/. Built on shadcn's `Empty` primitive
// (components/ui/empty.tsx, added with `npx shadcn@latest add empty`), the
// same way ConfirmDialog sits on top of AlertDialog: `ui/empty` stays
// unstyled, this file owns the NVSU-BRIMS look.
//
// Replaces empty_state.php's two helpers, same two variants:
//   - "no-results" ← render_zero_matches_state(): a search/filter matched
//     nothing, but rows exist. Default copy is the PHP's own
//     "No items found" / "Try adjusting your search or filters."
//   - "no-data"    ← render_zero_rows_state(): nothing exists yet. Callers
//     pass their own message (e.g. "No asset items currently found in the
//     system database.") since the useful wording differs per page.
//
// Purely presentational (no hooks, no "use client"), so it renders from
// either a Server or a Client Component. Kept borderless to match the plain
// empty blocks it replaces — shadcn's Empty sets `border-dashed` but no
// border width, so add `border` via className if an outlined look is wanted.
// ---------------------------------------------------------------------------

export type EmptyStateVariant = "no-results" | "no-data";

const VARIANT_DEFAULTS: Record<
  EmptyStateVariant,
  { icon: LucideIcon; title: string; description: string }
> = {
  "no-results": {
    icon: Search,
    title: "No items found",
    description: "Try adjusting your search or filters.",
  },
  "no-data": {
    icon: Archive,
    title: "Nothing here yet",
    description: "There are no records to show right now.",
  },
};

interface EmptyStateProps {
  /** "no-results" = filters matched nothing; "no-data" = nothing exists yet. */
  variant?: EmptyStateVariant;
  /** Overrides the variant's default title. */
  title?: string;
  /** Overrides the variant's default description. */
  description?: string;
  /** Overrides the variant's default icon. */
  icon?: LucideIcon;
  /** Optional next step (e.g. a "Clear filters" or "Add item" button). */
  action?: React.ReactNode;
  /** Tighter padding for use inside a Card (e.g. admin Home's activity list). */
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  variant = "no-results",
  title,
  description,
  icon,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  const defaults = VARIANT_DEFAULTS[variant];
  const Icon = icon ?? defaults.icon;

  return (
    <Empty
      // Zero-match results appear in response to typing/filtering, so let
      // assistive tech announce them; "no-data" is static page content.
      role={variant === "no-results" ? "status" : undefined}
      className={cn(compact && "gap-3 p-4 md:p-4", className)}
    >
      <EmptyHeader>
        {/* The `!` overrides are this project's standing workaround for
            shadcn class-merge conflicts (same as the Sheet/Tooltip
            overrides elsewhere) — brand green tile instead of the default
            muted gray, matching the About Us icon tiles. */}
        <EmptyMedia variant="icon" className="bg-green-50! text-green-700!">
          <Icon />
        </EmptyMedia>
        <EmptyTitle className="text-green-800">
          {title ?? defaults.title}
        </EmptyTitle>
        <EmptyDescription>
          {description ?? defaults.description}
        </EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}