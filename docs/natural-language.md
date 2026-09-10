# Natural-language task entry

Recognized phrases are highlighted while typing. Their chips show the values
that will be saved; editing or removing a chip updates the draft. Matching is
case-insensitive and tolerates trailing sentence punctuation.

| Field | Examples |
| --- | --- |
| Due date | `today`, `tod`, `tomorrow`, `tmr`, `Friday`, `on Friday`, `this Friday`, `coming Monday`, `upcoming Monday` |
| Relative date | `next week`, `next month`, `next year`, `next Friday`, `in two days`, `in 2 weeks`, `in a week`, `a week from now`, `2 days from now` |
| Calendar date | `2027-09-15`, `15/9`, `15.9`, `September 15`, `Sep 15`, `15 Sep`, `15th September`, `September 15th`, `Sep. 15, 2027`, `on the 1st`, `the 15th` |
| Time | `at noon`, `at midnight`, `at 5 pm`, `at 5 p.m.`, `at 17:30`, `5pm`, `17:30` |
| Part of day | `tomorrow morning`, `this afternoon`, `this evening`, `tonight` |
| Duration | `for 30m`, `for 1h30m`, `for 1h 30m`, `for 2 hours`, `for 90 minutes`, `for an hour`, `for half an hour`, `for 1.5 hours` |
| Due-date wording | `due Friday`, `due by Friday`, `by Friday` |
| Deadline | `deadline Friday`, `deadline by September 15`, `{friday}`, `{in two weeks}`, `{next month}` |
| Reminder | `Remind me tomorrow to call mom`, `Remind me at noon to call mom`, `Remind me to call mom tomorrow at 5pm` |
| Priority, project, labels | `p1`–`p4`, `#Home office`, `@deep work`; the composer matches existing names |

## Repeats

- `daily`, `weekly`, `monthly`, `yearly`, `annually`, `fortnightly`
- `every day`, `every 2 weeks`, `every two months`, `every year`
- `every weekday` (Monday–Friday), `every weekend` (Saturday and Sunday)
- `every Monday`, `every Mon and Wed`, `every Mon, Wed, Fri`
- `every other day`, `every other week`, `every other month`, `every other year`, `every other Monday`
- `every fortnight` (every two weeks)
- `every 1st`, `every 15th`, `every last day`, `1st of every month`
- `every 2nd Friday`, `the first Friday of every month`, `every last Friday`
- `every 5th Monday` skips months without a fifth Monday

Replace `every` with `every!` to count from the completion date, such as
`every! 3 days` or `every! 2nd Friday`. The Custom repeat dialog accepts these
phrases and preserves rules entered through natural language.

## Conventions and boundaries

- Numeric dates stay **day-first**, regardless of display format. Month names
  and ISO dates avoid that ambiguity. Dates without a year use this year or
  next year; a one-time ordinal uses the next month where that day exists.
- A bare weekday is strictly after today. `this Tuesday` can mean today.
  `next week` starts on Monday; `next Friday` is in that following week.
- Month/year offsets keep the day where possible and clamp at month-end.
- Morning and date-only reminders use **09:00**; afternoon uses **15:00**;
  evening and tonight use **18:00**. An explicit clock time overrides a day-part default.
- A time without a date uses today. One due-date or repeat phrase is consumed;
  the first wins. A deadline and reminder are separate fields.
- Reminder phrases create reminders, without implicitly assigning a due date.
  The composer uses the device's time zone; `/api/v1/tasks/quick-add` uses the
  account's time zone and requires `reminders:write` as well as `tasks:write`.
  Nonexistent times during a daylight-saving transition are rejected.
- Whole number words from zero through ninety-nine are supported for relative
  dates, durations, and repeat intervals (1–999). Durations also accept decimal hours,
  half an hour, and a quarter of an hour, totaling 1–1,440 whole minutes.
- `around 3`, `at 3ish`, `biweekly`, and `twice a week` remain literal because
  they do not specify an unambiguous clock time or schedule.
- Incomplete or invalid schedules stay literal instead of becoming shorter
  schedules. For example, `every 6th Friday` never becomes a monthly task on
  the 6th, and `for 1.5 ho` never becomes a May 1 due date.
- Deadlines contain dates only: `{noon}` remains literal. Descriptions,
  attachments, and sections use the composer's manual controls.
- Include a task name. Metadata-only input is retained as the title.
