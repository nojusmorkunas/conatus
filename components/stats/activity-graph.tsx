import { formatDate } from "@/lib/dates";
import type { ActivityGraphWeek } from "@/lib/stats";

// Levels are cut against the user's own daily goal rather than the busiest day
// in the window. A single outlier — a Todoist import lands hundreds of events
// on one date — would otherwise flatten a whole year to the lightest shade.
function levelFor(count: number, dailyGoal: number): number {
  if (count <= 0) return 0;
  if (count >= dailyGoal * 2) return 4;
  if (count >= dailyGoal) return 3;
  if (count >= dailyGoal / 2) return 2;
  return 1;
}

// Opacity over the card surface rather than fixed blue shades, so the ramp
// keeps its contrast in both themes. blue-500 matches the project swatch.
const levelClasses = [
  "bg-muted",
  "bg-blue-500/30",
  "bg-blue-500/55",
  "bg-blue-500/80",
  "bg-blue-500",
];

const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ActivityGraph({
  weeks,
  months,
  total,
  weekStart,
  dailyGoal,
  dateFormat,
  unit,
}: {
  weeks: ActivityGraphWeek[];
  months: { label: string; weekIndex: number }[];
  total: number;
  weekStart: number;
  dailyGoal: number;
  dateFormat: string;
  unit: string;
}) {
  return (
    // The whole year fits on a wide viewport and scrolls on a narrow one. `dir`
    // is flipped here and restored on the child so a scrolling graph opens on
    // the most recent week rather than a year ago, without any client script.
    <div className="overflow-x-auto pb-1" dir="rtl">
      <div
        className="w-max"
        dir="ltr"
        role="img"
        aria-label={`Activity graph: ${total} ${unit} over the past year.`}
      >
        <div className="flex gap-[2px] pl-[34px]">
          {weeks.map((_, index) => {
            const month = months.find((entry) => entry.weekIndex === index);
            return (
              <div key={index} className="w-[10px] text-[10px] text-muted-foreground">
                {month?.label}
              </div>
            );
          })}
        </div>

        <div className="mt-1 flex gap-[2px]">
          <div className="flex w-8 flex-col gap-[2px] pr-1 text-right">
            {Array.from({ length: 7 }, (_, row) => (
              <div key={row} className="h-[10px] text-[10px] leading-[10px] text-muted-foreground">
                {row % 2 === 1 ? weekdayNames[(weekStart + row) % 7] : ""}
              </div>
            ))}
          </div>

          {weeks.map((week, index) => (
            <div key={index} className="flex flex-col gap-[2px]">
              {week.map((day, row) =>
                day ? (
                  <div
                    key={day.date}
                    className={`h-[10px] w-[10px] rounded-[2px] ${levelClasses[levelFor(day.count, dailyGoal)]}`}
                    title={`${day.count} ${day.count === 1 ? unit.replace(/s$/, "") : unit} on ${formatDate(day.date, dateFormat)}`}
                  />
                ) : (
                  <div key={row} className="h-[10px] w-[10px]" />
                ),
              )}
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-end gap-[2px] text-[10px] text-muted-foreground">
          <span className="mr-1">Less</span>
          {levelClasses.map((className) => (
            <div key={className} className={`h-[10px] w-[10px] rounded-[2px] ${className}`} />
          ))}
          <span className="ml-1">More</span>
        </div>
      </div>
    </div>
  );
}
