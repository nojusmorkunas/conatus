"use client";

import { createContext, useContext, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { addDays, addMonths, dateInTimezone, formatDate, monthGridStart, parseDate, WEEKDAY_LABELS } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Defaults match the users table, for anything rendered outside the app layout.
const DatePreferences = createContext({ dateFormat: "yyyy-MM-dd", weekStart: 1 });

export function DatePreferencesProvider({ dateFormat, weekStart, children }: {
  dateFormat: string;
  weekStart: number;
  children: React.ReactNode;
}) {
  return <DatePreferences value={{ dateFormat, weekStart }}>{children}</DatePreferences>;
}

export function useDatePreferences() {
  return useContext(DatePreferences);
}

// Native date inputs follow the browser's locale for both the text and the
// picker's first weekday, so this one draws its own to follow the settings.
// ponytail: no arrow-key grid navigation; typing the date covers keyboard use.
export function DateInput({ value, onChange, min, className, disabled, ...props }: Omit<React.ComponentProps<"input">, "value" | "onChange" | "min" | "type"> & {
  value: string;
  onChange: (value: string) => void;
  min?: string;
}) {
  const { dateFormat, weekStart } = useDatePreferences();
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState("");
  const [today, setToday] = useState("");
  const shown = value ? formatDate(value, dateFormat) : "";
  const start = month ? monthGridStart(month, weekStart) : "";

  return (
    <div className={cn("relative w-full", className)}>
      <Input
        {...props}
        disabled={disabled}
        placeholder={dateFormat.toLowerCase()}
        className="pr-8"
        value={draft ?? shown}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          if (!text.trim()) return onChange("");
          const parsed = parseDate(text, dateFormat);
          if (parsed && !(min && parsed < min)) onChange(parsed);
        }}
        onBlur={(event) => { setDraft(null); props.onBlur?.(event); }}
      />
      <Popover open={open} onOpenChange={(next) => {
        if (next) {
          // The browser's own day, like the native picker it replaces.
          const now = dateInTimezone(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
          setToday(now);
          setMonth((value || now).slice(0, 7));
        }
        setOpen(next);
      }}>
        <PopoverTrigger
          disabled={disabled}
          render={<Button type="button" variant="ghost" size="icon-xs" aria-label="Choose date" className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground" />}
        >
          <CalendarDays />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft /></Button>
            <span className="text-sm font-medium" aria-live="polite">
              {month && new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
            </span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight /></Button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {[...WEEKDAY_LABELS.slice(weekStart), ...WEEKDAY_LABELS.slice(0, weekStart)].map((label) => (
              <span key={label} className="py-1 text-xs text-muted-foreground">{label.slice(0, 2)}</span>
            ))}
            {start && Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((day) => (
              <button
                key={day}
                type="button"
                disabled={Boolean(min && day < min)}
                aria-label={formatDate(day, dateFormat)}
                aria-pressed={day === value}
                onClick={() => { onChange(day); setOpen(false); }}
                className={cn(
                  "flex size-8 items-center justify-center rounded-md text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40",
                  day.slice(0, 7) !== month && "text-muted-foreground",
                  day === today && "font-semibold ring-1 ring-muted-foreground/60 ring-inset",
                  day === value && "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {Number(day.slice(8))}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
