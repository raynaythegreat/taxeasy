import { describe, expect, it } from "vitest";
import { lastDayOf } from "./date-utils";

describe("lastDayOf", () => {
  it("converts Q1 half-open end (Apr 1) to inclusive last day (Mar 31)", () => {
    expect(lastDayOf("2024-04-01")).toBe("2024-03-31");
  });

  it("converts annual half-open end (Jan 1 next year) to inclusive last day (Dec 31)", () => {
    expect(lastDayOf("2025-01-01")).toBe("2024-12-31");
  });

  it("converts H1 half-open end (Jul 1) to inclusive last day (Jun 30)", () => {
    expect(lastDayOf("2024-07-01")).toBe("2024-06-30");
  });
});
