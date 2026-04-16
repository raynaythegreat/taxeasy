import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${m}/${d}/${y}`;
}

export function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function fiscalYearRange(year: number, startMonth = 1): { from: string; to: string } {
  const from = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const endYear = startMonth === 1 ? year : year + 1;
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const lastDay = new Date(endYear, endMonth, 0).getDate();
  const to = `${endYear}-${String(endMonth).padStart(2, "0")}-${lastDay}`;
  return { from, to };
}

export type ReportPeriod = "annual" | "h1" | "h2" | "q1" | "q2" | "q3" | "q4";

const PERIOD_RANGES: Record<ReportPeriod, { startM: number; endM: number }> = {
  annual: { startM: 1, endM: 12 },
  h1:     { startM: 1, endM: 6 },
  h2:     { startM: 7, endM: 12 },
  q1:     { startM: 1, endM: 3 },
  q2:     { startM: 4, endM: 6 },
  q3:     { startM: 7, endM: 9 },
  q4:     { startM: 10, endM: 12 },
};

export const PERIOD_LABELS: Record<ReportPeriod, string> = {
  annual: "Annual",
  h1: "H1",
  h2: "H2",
  q1: "Q1",
  q2: "Q2",
  q3: "Q3",
  q4: "Q4",
};

export function periodRange(year: number, period: ReportPeriod): { from: string; to: string } {
  const { startM, endM } = PERIOD_RANGES[period];
  const from = `${year}-${String(startM).padStart(2, "0")}-01`;
  const lastDay = new Date(year, endM, 0).getDate();
  const to = `${year}-${String(endM).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}
