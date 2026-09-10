import { expect, test } from "vitest";
import { localDateTimeToUtc } from "./local-time";

test.each([
  ["2026-07-15T09:00", "Europe/Amsterdam", "2026-07-15T07:00:00.000Z"],
  ["2026-01-15T09:00", "Europe/Amsterdam", "2026-01-15T08:00:00.000Z"],
  ["2026-07-15T09:00", "America/New_York", "2026-07-15T13:00:00.000Z"],
  ["2026-07-15T00:00", "Asia/Kathmandu", "2026-07-14T18:15:00.000Z"],
  ["2026-10-25T02:30", "Europe/Amsterdam", "2026-10-25T00:30:00.000Z"],
])("resolves %s in %s", (value, zone, expected) => {
  expect(localDateTimeToUtc(value, zone)?.toISOString()).toBe(expected);
});

test.each([
  ["2026-03-29T02:30", "Europe/Amsterdam"], ["2026-02-31T09:00", "UTC"],
  ["2026-07-14T99:00", "UTC"], ["2026-07-14T09:00", "invalid"], ["nonsense", "UTC"],
])("rejects an invalid or nonexistent wall time: %s in %s", (value, zone) => {
  expect(localDateTimeToUtc(value, zone)).toBeNull();
});
