"use client";

import * as React from "react";
import { format, isValid, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { Matcher } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ---------------------------------------------------------------------------
// Branded date picker — replaces the native <input type="date"> (whose
// calendar popup is drawn by the browser and can't be themed) the same way
// the original app's assets/js/date-picker.js did. shadcn has no standalone
// date-picker component; it's the documented Popover + Calendar composition,
// wrapped here once so every dashboard page shares one look.
//
// Lives in shared/dashboard/ next to form-field.tsx: only the admin and
// borrower pages use dates.
//
// Value contract: "YYYY-MM-DD" strings in and out — the same shape the
// pages already keep in state for the native input — or "" for "no date".
// Dates are parsed/formatted with LOCAL date parts (date-fns), never
// toISOString(), so a user ahead of UTC doesn't get yesterday's date
// between midnight and the UTC offset.
//
// Props mirror the native input where the pages relied on it:
//   min / max  → days outside the range are disabled in the calendar
//   required   → the value can't be cleared (no "Clear" button), like a
//                required native input that always holds a date
// ---------------------------------------------------------------------------

const ISO_FORMAT = "yyyy-MM-dd";

function fromIso(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, ISO_FORMAT, new Date());
  return isValid(parsed) ? parsed : undefined;
}

interface DatePickerProps {
  /** Applied to the trigger button so a <Label htmlFor> can point at it. */
  id?: string;
  /** "YYYY-MM-DD", or "" when no date is chosen. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable day, "YYYY-MM-DD". */
  min?: string;
  /** Latest selectable day, "YYYY-MM-DD". */
  max?: string;
  placeholder?: string;
  /** When true the value can't be cleared. */
  required?: boolean;
  disabled?: boolean;
  /** Applied to the trigger — pages set the width (e.g. "w-40", "w-full"). */
  className?: string;
}

export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  placeholder = "Select date",
  required = false,
  disabled = false,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = fromIso(value);

  const disabledDays = React.useMemo(() => {
    const days: Matcher[] = [];
    const minDate = fromIso(min);
    const maxDate = fromIso(max);
    if (minDate) days.push({ before: minDate });
    if (maxDate) days.push({ after: maxDate });
    return days.length > 0 ? days : undefined;
  }, [min, max]);

  const handleSelect = (date: Date | undefined) => {
    // Re-clicking the selected day reports `undefined`; ignore it so the
    // value only clears through the explicit "Clear" button.
    if (!date) return;
    onChange(format(date, ISO_FORMAT));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Styled with buttonVariants instead of nesting <Button> through
          `render`/`asChild`, so this works the same whichever primitive the
          generated popover.tsx is built on. type="button" keeps it from
          submitting the borrow dialog's <form>. */}
      <PopoverTrigger
        id={id}
        type="button"
        disabled={disabled}
        data-empty={!selected}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "rounded-md! justify-start gap-2 bg-white font-normal hover:bg-white",
          "hover:border-emerald-600 hover:ring-2 hover:ring-emerald-600/30",
          "focus-visible:border-emerald-600 focus-visible:ring-emerald-600/30",
          "aria-expanded:border-emerald-600 aria-expanded:ring-2 aria-expanded:ring-emerald-600/30",
          "data-[empty=true]:text-muted-foreground",
          className
        )}
      >
        <CalendarIcon className="size-4 shrink-0 text-green-700" aria-hidden="true" />
        {selected ? format(selected, "MMM d, yyyy") : placeholder}
      </PopoverTrigger>
      {/* The two --primary overrides recolor the selected day (which the
          shadcn Calendar paints with bg-primary) to the same green-600 as
          the app's primary buttons, scoped to this popup only. If the
          selected day still looks neutral, this is the line to adjust. */}
      <PopoverContent
        align="start"
        className="w-auto p-0 [--primary:oklch(0.627_0.194_149.214)] [--primary-foreground:white]"
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={selected ?? fromIso(min)}
          disabled={disabledDays}
        />
        {!required && selected && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}