import { Construction } from "lucide-react";

interface UnderConstructionProps {
  title: string;
  description?: string;
}

// Reusable placeholder for every dashboard section that doesn't have real
// content/data wiring yet. Copy-paste pattern: each section's page.tsx is
// just `<UnderConstruction title="..." />` until its real Prisma query +
// UI gets built out (see COMPLETED_TASKS.md for what's still pending).
export function UnderConstruction({ title, description }: UnderConstructionProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
      <Construction className="size-10 text-slate-400" />
      <h2 className="text-xl font-semibold text-slate-700">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {description ?? "This section is under construction. Check back soon."}
      </p>
    </div>
  );
}