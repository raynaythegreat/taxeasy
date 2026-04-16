import { describe, expect, it } from "vitest";
import { cn, fiscalYearRange, formatCurrency, formatDate, periodRange } from "./utils";

describe("cn", () => {
  it("merges class names without conflicts", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
  });

  it("resolves Tailwind conflicts by keeping the last value", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("ignores falsy values", () => {
    expect(cn("foo", false, undefined, "bar")).toBe("foo bar");
  });
});

describe("formatCurrency", () => {
  it("formats a positive number as USD", () => {
    expect(formatCurrency(1234.56)).toBe("$1,234.56");
  });

  it("formats a numeric string", () => {
    expect(formatCurrency("99.9")).toBe("$99.90");
  });

  it("returns $0.00 for NaN input", () => {
    expect(formatCurrency("abc")).toBe("$0.00");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });
});

describe("formatDate", () => {
  it("converts ISO date to MM/DD/YYYY", () => {
    expect(formatDate("2024-03-15")).toBe("03/15/2024");
  });

  it("returns empty string for empty input", () => {
    expect(formatDate("")).toBe("");
  });
});

describe("fiscalYearRange", () => {
  it("returns Jan 1 – Dec 31 for a calendar year", () => {
    const { from, to } = fiscalYearRange(2024);
    expect(from).toBe("2024-01-01");
    expect(to).toBe("2024-12-31");
  });

  it("spans two calendar years when startMonth is not January", () => {
    const { from, to } = fiscalYearRange(2024, 4);
    expect(from).toBe("2024-04-01");
    expect(to).toBe("2025-03-31");
  });
});

describe("periodRange (half-open [from, to))", () => {
  // Per B3: periodRange returns `to` as the next-period start, not last-day-of-period,
  // so downstream SQL queries can use `>= from AND < to` without off-by-one risk.
  it("returns the full year for annual period", () => {
    const { from, to } = periodRange(2024, "annual");
    expect(from).toBe("2024-01-01");
    expect(to).toBe("2025-01-01");
  });

  it("returns Q1 bounds", () => {
    const { from, to } = periodRange(2024, "q1");
    expect(from).toBe("2024-01-01");
    expect(to).toBe("2024-04-01");
  });

  it("returns H2 bounds", () => {
    const { from, to } = periodRange(2024, "h2");
    expect(from).toBe("2024-07-01");
    expect(to).toBe("2025-01-01");
  });
});
