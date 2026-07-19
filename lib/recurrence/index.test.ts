import { describe, expect, test } from "vitest";
import { nextOccurrence, nextOccurrenceWithinEnd, parseRecurrence } from ".";

describe("parseRecurrence", () => {
  const cases: [string, string | null][] = [
    ["every day", "every day"],
    ["Every Day", "every day"],
    ["every week", "every week"],
    ["every month", "every month"],
    ["every year", "every year"],
    ["every days", "every day"],
    ["every 1 day", "every day"],
    ["every 2 weeks", "every 2 weeks"],
    ["every 3 day", "every 3 days"],
    ["every 30 days", "every 30 days"],
    ["every monday", "every monday"],
    ["every Mon", "every monday"],
    ["every sun", "every sunday"],
    ["every 2 years", null],
    ["every 0 days", null],
    ["every", null],
    ["daily", null],
    ["everyday", null],
    // every! (completion-relative)
    ["every! day", "every! day"],
    ["Every! 3 Weeks", "every! 3 weeks"],
    ["every! monday", "every! monday"],
    ["every! weekday", "every! weekday"],
    ["every! last day", "every! last day"],
    ["every! 15th", "every! 15th"],
    ["every! other tue", "every! other tuesday"],
    ["every!", null],
    ["every! garbage", null],
    ["every! 0 days", null],
    // every other
    ["every other day", "every 2 days"],
    ["every Other Week", "every 2 weeks"],
    ["every other months", "every 2 months"],
    ["every other monday", "every other monday"],
    ["every other Mon", "every other monday"],
    ["every other year", null],
    ["every other", null],
    // every weekday
    ["every weekday", "every weekday"],
    ["every weekdays", null],
    // every last day
    ["every last day", "every last day"],
    ["every last days", "every last day"],
    ["every last", null],
    // every Nth day-of-month
    ["every 1st", "every 1st"],
    ["every 2nd", "every 2nd"],
    ["every 3rd", "every 3rd"],
    ["every 15th", "every 15th"],
    ["every 21st", "every 21st"],
    ["every 22nd", "every 22nd"],
    ["every 31st", "every 31st"],
    ["every 0th", null],
    ["every 32nd", null],
    ["every 31th", null],
    ["every 3st", null],
    ["every 15", null],
  ];

  test.each(cases)("%j", (input, expected) => {
    expect(parseRecurrence(input)).toBe(expected);
  });

  test("every canonical form round-trips through parseRecurrence", () => {
    const canonicals = cases
      .map(([, canonical]) => canonical)
      .filter((c): c is string => c !== null);
    for (const canonical of canonicals) {
      expect(parseRecurrence(canonical)).toBe(canonical);
    }
  });
});

describe("nextOccurrence", () => {
  // 2026-07-14 is a Tuesday.
  const today = "2026-07-14";

  test("every day, due today", () => {
    expect(nextOccurrence("every day", today, today)).toBe("2026-07-15");
  });

  test("every day, overdue catches up to tomorrow", () => {
    expect(nextOccurrence("every day", "2026-07-07", today)).toBe("2026-07-15");
  });

  test("every 3 days keeps its cadence when overdue", () => {
    // From 07-07: 07-10, 07-13, 07-16 — first one after today.
    expect(nextOccurrence("every 3 days", "2026-07-07", today)).toBe("2026-07-16");
  });

  test("every week from today", () => {
    expect(nextOccurrence("every week", today, today)).toBe("2026-07-21");
  });

  test("every monday, due a past monday", () => {
    expect(nextOccurrence("every monday", "2026-07-06", today)).toBe("2026-07-20");
  });

  test("every tuesday, due today (a tuesday), rolls a full week", () => {
    expect(nextOccurrence("every tuesday", today, today)).toBe("2026-07-21");
  });

  test("every wednesday, due in the future, steps past the due date", () => {
    expect(nextOccurrence("every wednesday", "2026-07-22", today)).toBe("2026-07-29");
  });

  test("every month clamps month-end", () => {
    expect(nextOccurrence("every month", "2026-01-31", "2026-01-31")).toBe("2026-02-28");
  });

  test("every month keeps the day-31 anchor across a clamped month", () => {
    // Overdue from Jan 31: Feb 28, Mar 31 — anchor not stuck at 28.
    expect(nextOccurrence("every month", "2026-01-31", "2026-03-01")).toBe("2026-03-31");
  });

  test("every year clamps leap day", () => {
    expect(nextOccurrence("every year", "2024-02-29", "2024-02-29")).toBe("2025-02-28");
  });

  describe("every! (completion-relative)", () => {
    test("every! 3 days ignores the overdue anchor: today + 3", () => {
      // Plain "every 3 days" from 07-07 gives 07-16; every! restarts today.
      expect(nextOccurrence("every! 3 days", "2026-07-07", today)).toBe("2026-07-17");
    });

    test("every! day, completed on time, matches plain form", () => {
      expect(nextOccurrence("every! day", today, today)).toBe("2026-07-15");
    });

    test("every! 2 weeks from completion day", () => {
      expect(nextOccurrence("every! 2 weeks", "2026-06-01", today)).toBe("2026-07-28");
    });

    test("every! monday ignores a future due date; plain does not", () => {
      expect(nextOccurrence("every! monday", "2026-07-27", today)).toBe("2026-07-20");
      expect(nextOccurrence("every monday", "2026-07-27", today)).toBe("2026-08-03");
    });

    test("every! monday completed on a monday rolls a full week", () => {
      expect(nextOccurrence("every! monday", "2026-01-01", "2026-07-13")).toBe("2026-07-20");
    });
  });

  describe("every weekday", () => {
    test("tuesday rolls to wednesday", () => {
      expect(nextOccurrence("every weekday", today, today)).toBe("2026-07-15");
    });

    test("friday skips the weekend to monday", () => {
      expect(nextOccurrence("every weekday", "2026-07-17", "2026-07-17")).toBe("2026-07-20");
    });

    test("saturday due date lands on monday", () => {
      expect(nextOccurrence("every weekday", "2026-07-18", "2026-07-18")).toBe("2026-07-20");
    });

    test("long-overdue catches up after today, not after the old due date", () => {
      expect(nextOccurrence("every weekday", "2026-07-01", "2026-07-17")).toBe("2026-07-20");
    });

    test("future due date steps from the due date", () => {
      // 2026-07-24 is a Friday.
      expect(nextOccurrence("every weekday", "2026-07-24", today)).toBe("2026-07-27");
    });

    test("every! weekday steps from today even with a future due date", () => {
      expect(nextOccurrence("every! weekday", "2026-07-24", today)).toBe("2026-07-15");
    });
  });

  describe("every other <weekday>", () => {
    test("completed on the due monday: a fortnight later", () => {
      expect(nextOccurrence("every other monday", "2026-07-06", "2026-07-06")).toBe("2026-07-20");
    });

    test("completed the day after: still the anchored fortnight", () => {
      expect(nextOccurrence("every other monday", "2026-07-13", today)).toBe("2026-07-27");
    });

    test("long-overdue keeps fortnight parity instead of the nearest monday", () => {
      // Anchor 07-06: 07-20, 08-03, 08-17. Today 08-04 (Tue) → 08-17,
      // skipping 08-10, which plain "every monday" would return.
      expect(nextOccurrence("every other monday", "2026-07-06", "2026-08-04")).toBe("2026-08-17");
      expect(nextOccurrence("every monday", "2026-07-06", "2026-08-04")).toBe("2026-08-10");
    });

    test("anchor off the weekday snaps to the first such weekday after it", () => {
      // 2026-07-08 is a Wednesday; first monday after is 07-13.
      expect(nextOccurrence("every other monday", "2026-07-08", "2026-07-08")).toBe("2026-07-13");
    });

    test("future due monday: from + 14", () => {
      expect(nextOccurrence("every other monday", "2026-07-27", today)).toBe("2026-08-10");
    });

    test("every! other monday restarts from today", () => {
      expect(nextOccurrence("every! other monday", "2026-01-05", today)).toBe("2026-07-20");
    });
  });

  describe("every last day", () => {
    test("january rolls to february's shorter month-end", () => {
      expect(nextOccurrence("every last day", "2026-01-31", "2026-01-31")).toBe("2026-02-28");
    });

    test("leap-year february", () => {
      expect(nextOccurrence("every last day", "2028-01-31", "2028-02-01")).toBe("2028-02-29");
    });

    test("30-day month to 31-day month", () => {
      expect(nextOccurrence("every last day", "2026-06-30", "2026-06-30")).toBe("2026-07-31");
    });

    test("year rollover: dec 31 to jan 31", () => {
      expect(nextOccurrence("every last day", "2026-12-31", "2026-12-31")).toBe("2027-01-31");
    });

    test("mid-month anchor still lands on this month's end", () => {
      expect(nextOccurrence("every last day", "2026-07-10", "2026-07-10")).toBe("2026-07-31");
    });

    test("long-overdue skips straight to the next future month-end", () => {
      expect(nextOccurrence("every last day", "2026-01-31", "2026-07-14")).toBe("2026-07-31");
    });
  });

  describe("every <Nth>", () => {
    test("every 15th, due on the 15th, rolls a month", () => {
      expect(nextOccurrence("every 15th", "2026-07-15", "2026-07-15")).toBe("2026-08-15");
    });

    test("every 15th, overdue, catches up to this month's 15th", () => {
      expect(nextOccurrence("every 15th", "2026-05-15", today)).toBe("2026-07-15");
    });

    test("every 1st rolls to the next month's 1st", () => {
      expect(nextOccurrence("every 1st", "2026-07-01", "2026-07-01")).toBe("2026-08-01");
    });

    test("every 31st clamps to february 28", () => {
      expect(nextOccurrence("every 31st", "2026-01-31", "2026-01-31")).toBe("2026-02-28");
    });

    test("every 31st completed on the clamped feb 28 moves on to mar 31", () => {
      expect(nextOccurrence("every 31st", "2026-01-31", "2026-02-28")).toBe("2026-03-31");
    });

    test("every 31st keeps the 31 anchor after a clamped month", () => {
      expect(nextOccurrence("every 31st", "2026-01-31", "2026-03-01")).toBe("2026-03-31");
    });

    test("anchor off the pattern day snaps to the pattern", () => {
      // Rescheduled to the 20th; next 15th strictly after is Aug 15.
      expect(nextOccurrence("every 15th", "2026-07-20", "2026-07-20")).toBe("2026-08-15");
    });

    test("december 15th rolls into the next year", () => {
      expect(nextOccurrence("every 15th", "2026-12-15", "2026-12-15")).toBe("2027-01-15");
    });

    test("every! 15th counts from today's month", () => {
      expect(nextOccurrence("every! 15th", "2025-01-15", today)).toBe("2026-07-15");
    });
  });
});

describe("nextOccurrenceWithinEnd", () => {
  test("allows an occurrence on the inclusive end date", () => {
    expect(
      nextOccurrenceWithinEnd("every week", "2026-07-14", "2026-07-14", "2026-07-21"),
    ).toBe("2026-07-21");
  });

  test("returns null when the next occurrence is after the end date", () => {
    expect(
      nextOccurrenceWithinEnd("every week", "2026-07-21", "2026-07-21", "2026-07-21"),
    ).toBeNull();
  });
});
