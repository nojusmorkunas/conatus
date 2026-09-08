"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ChevronDown, Repeat, X } from "lucide-react";

import { ordinal, parseRecurrence } from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const WEEKDAYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
] as const;

const UNITS = ["day", "week", "month", "year"] as const;
type Unit = (typeof UNITS)[number];

const unitLabels: Record<Unit, string> = {
  day: "days",
  week: "weeks",
  month: "months",
  year: "years",
};

// The rules people reach for. Everything else the grammar accepts is built in
// the custom dialog, so the menu stays short without capping what's possible.
const PRESETS = [
  { label: "Daily", rule: "every day" },
  { label: "Weekly", rule: "every week" },
  { label: "Every 2 weeks", rule: "every 2 weeks" },
  { label: "Monthly", rule: "every month" },
  { label: "Yearly", rule: "every year" },
  { label: "Every weekday (Mon–Fri)", rule: "every weekday" },
];

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "every! 3 days" → "Every 3 days, from completion" for display. */
function recurrenceLabel(rule: string) {
  const plain = rule.replace("every!", "every");
  const preset = PRESETS.find((option) => option.rule === plain);
  const base = preset
    ? preset.label
    : capitalize(plain.replace(/ (\w+day)$/, (_, day) => ` ${capitalize(day)}`));
  return rule.startsWith("every!") ? `${base}, from completion` : base;
}

// What the custom dialog edits. A weekday only survives weekly repeats of one
// or two ("every monday", "every other monday") and a day of the month only
// survives monthly ones, because those are the rules the grammar can express.
type Fields = {
  interval: number;
  unit: Unit;
  weekday: string | null;
  monthDay: number | "last" | null;
  fromCompletion: boolean;
};

const defaultFields: Fields = {
  interval: 1,
  unit: "week",
  weekday: null,
  monthDay: null,
  fromCompletion: false,
};

function buildRule(fields: Fields): string | null {
  const { interval, unit, weekday, monthDay } = fields;
  const body =
    unit === "week" && weekday && interval <= 2
      ? interval === 2
        ? `other ${weekday}`
        : weekday
      : unit === "month" && monthDay && interval === 1
        ? monthDay === "last"
          ? "last day"
          : ordinal(monthDay)
        : interval === 1
          ? unit
          : `${interval} ${unit}s`;
  // Round-trip through the parser so the dialog can never save a rule the
  // rest of the app would reject.
  return parseRecurrence(`${fields.fromCompletion ? "every!" : "every"} ${body}`);
}

/** Best-effort inverse of buildRule, for opening the dialog on an existing rule. */
function toFields(rule: string | null): Fields {
  if (!rule) return defaultFields;
  const fromCompletion = rule.startsWith("every!");
  const body = rule.replace(/^every!? /, "");
  const base = { ...defaultFields, fromCompletion };

  const weekday = WEEKDAYS.find((day) => body === day || body === `other ${day}`);
  if (weekday) {
    return { ...base, unit: "week", interval: body.startsWith("other") ? 2 : 1, weekday };
  }
  if (body === "last day") return { ...base, unit: "month", monthDay: "last" };

  const nth = /^(\d+)(?:st|nd|rd|th)$/.exec(body);
  if (nth) return { ...base, unit: "month", monthDay: Number(nth[1]) };

  const interval = /^(?:(\d+) )?(day|week|month|year)s?$/.exec(body);
  if (interval) {
    return { ...base, unit: interval[2] as Unit, interval: Number(interval[1] ?? 1) };
  }
  return base; // "every weekday" has no dialog shape; start from the defaults
}

export function RecurrencePicker({
  value,
  onChange,
  anchorDate,
  appearance = "control",
}: {
  value: string | null;
  onChange: (rule: string | null) => void;
  /** Date the weekday preset is derived from; omit to drop that preset. */
  anchorDate?: string | null;
  /**
   * "control" sits beside the composer's inputs and selects; "inline" matches
   * the detail rail, where every field is a borderless line of text.
   */
  appearance?: "control" | "inline";
}) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  const weekday = anchorDate
    ? WEEKDAYS[new Date(`${anchorDate}T00:00:00Z`).getUTCDay()]
    : null;
  const options = weekday
    ? [...PRESETS, { label: `Every ${capitalize(weekday)}`, rule: `every ${weekday}` }]
    : PRESETS;

  function choose(rule: string | null) {
    onChange(rule);
    setOpen(false);
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            appearance === "inline" ? (
              <button
                type="button"
                aria-label="Repeat"
                className={cn(
                  "flex items-center gap-1 text-sm",
                  !value && "text-muted-foreground",
                )}
              >
                <Repeat className="size-3.5" />
                {value ? recurrenceLabel(value) : "Add repeat"}
              </button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Repeat"
                // text-sm keeps it level with the select triggers beside it,
                // which stay at 14px in their small size.
                className={cn("text-sm", !value && "text-muted-foreground")}
              >
                <Repeat />
                {value ? recurrenceLabel(value) : "No repeat"}
                <ChevronDown data-icon="inline-end" className="text-muted-foreground" />
              </Button>
            )
          }
        />
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Repeat</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={!value} onClick={() => choose(null)}>
              No repeat
            </DropdownMenuCheckboxItem>
            {options.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.rule}
                checked={value === option.rule}
                onClick={() => choose(option.rule)}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setOpen(false);
              setCustomOpen(true);
            }}
          >
            Custom…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {customOpen && (
        <CustomRepeatDialog
          value={value}
          onClose={() => setCustomOpen(false)}
          onSave={(rule) => {
            onChange(rule);
            setCustomOpen(false);
          }}
        />
      )}
    </>
  );
}

function CustomRepeatDialog({
  value,
  onSave,
  onClose,
}: {
  value: string | null;
  onSave: (rule: string) => void;
  onClose: () => void;
}) {
  const [fields, setFields] = useState(() => toFields(value));
  // Held as text so the field can be cleared mid-edit without snapping to 1.
  const [intervalText, setIntervalText] = useState(String(toFields(value).interval));

  function update(changes: Partial<Fields>) {
    setFields((current) => ({ ...current, ...changes }));
  }

  const showWeekday = fields.unit === "week" && fields.interval <= 2;
  const showMonthDay = fields.unit === "month" && fields.interval === 1;
  const rule = buildRule(fields);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-4 shadow-xl">
          <div className="mb-4 flex items-center justify-between gap-2">
            <Dialog.Title className="text-sm font-medium">Custom repeat</Dialog.Title>
            <Dialog.Close render={<Button variant="ghost" size="icon-sm" aria-label="Close custom repeat" />}>
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Repeat every</span>
            <Input
              type="number"
              min={1}
              max={999}
              aria-label="Repeat interval"
              className="w-20"
              value={intervalText}
              onChange={(event) => {
                setIntervalText(event.target.value);
                const interval = Number(event.target.value);
                if (Number.isInteger(interval) && interval >= 1 && interval <= 999) {
                  update({ interval });
                }
              }}
              onBlur={() => setIntervalText(String(fields.interval))}
            />
            <Select
              items={unitLabels}
              value={fields.unit}
              onValueChange={(unit) => update({ unit: unit as Unit })}
            >
              <SelectTrigger aria-label="Repeat unit">
                <SelectValue>{unitLabels[fields.unit]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unitLabels[unit]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showWeekday && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">on</span>
              <Select
                value={fields.weekday ?? "any"}
                onValueChange={(day) => update({ weekday: day === "any" ? null : day })}
              >
                <SelectTrigger aria-label="Repeat weekday">
                  <SelectValue>
                    {fields.weekday ? capitalize(fields.weekday) : "any day"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">any day</SelectItem>
                  {WEEKDAYS.map((day) => (
                    <SelectItem key={day} value={day}>
                      {capitalize(day)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showMonthDay && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">on the</span>
              <Select
                value={String(fields.monthDay ?? "any")}
                onValueChange={(day) =>
                  update({
                    monthDay: day === "any" ? null : day === "last" ? "last" : Number(day),
                  })
                }
              >
                <SelectTrigger aria-label="Repeat day of month">
                  <SelectValue>
                    {fields.monthDay === "last"
                      ? "last day"
                      : fields.monthDay
                        ? ordinal(fields.monthDay)
                        : "same day"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="any">same day</SelectItem>
                  {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                    <SelectItem key={day} value={String(day)}>
                      {ordinal(day)}
                    </SelectItem>
                  ))}
                  <SelectItem value="last">last day</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              // The label also carries the explanation below, which would
              // otherwise end up in this control's accessible name.
              aria-label="Count from the completion date"
              className="mt-0.5 size-4 accent-foreground"
              checked={fields.fromCompletion}
              onChange={(event) => update({ fromCompletion: event.target.checked })}
            />
            <span>
              Count from the completion date
              <span className="block text-xs text-muted-foreground">
                The next date is measured from the day you tick the task off, not from its due date.
              </span>
            </span>
          </label>

          <p className="mt-4 text-xs text-muted-foreground">
            {rule ? `Repeats: ${recurrenceLabel(rule)}` : "That combination isn't a valid repeat."}
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!rule}
              onClick={() => { if (rule) onSave(rule); }}
            >
              Save
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
