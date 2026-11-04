import { describe, expect, it } from "vitest";

import { formatDate, utcToZoned, zonedTimeToUtc } from "./format";

describe("time zones", () => {
  it("converts wall-clock time in a zone to UTC, across DST", () => {
    expect(zonedTimeToUtc("2026-01-15", "09:00", "Europe/London")).toBe("2026-01-15T09:00:00.000Z");
    expect(zonedTimeToUtc("2026-07-15", "09:00", "Europe/London")).toBe("2026-07-15T08:00:00.000Z");
    expect(zonedTimeToUtc("2026-07-15", "09:00", "America/New_York")).toBe(
      "2026-07-15T13:00:00.000Z",
    );
  });

  it("shows UTC instants in the user's zone", () => {
    expect(utcToZoned("2026-03-10T23:30:00Z", "Asia/Tokyo")).toEqual({
      date: "2026-03-11",
      time: "08:30",
    });
  });

  it("formats calendar dates without shifting the day", () => {
    expect(formatDate("2026-03-01")).toMatch(/1/);
    expect(formatDate(null)).toBe("Not set");
  });
});
