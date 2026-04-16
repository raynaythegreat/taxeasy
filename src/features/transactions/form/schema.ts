import { z } from "zod";

// ── Advanced mode schema ───────────────────────────────────────────────────────

export const advancedSchema = z.object({
  txnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required (YYYY-MM-DD)"),
  description: z.string().min(1, "Description is required").max(500),
  reference: z.string().max(100).optional(),
});

export type AdvancedFormValues = z.infer<typeof advancedSchema>;

// ── Simple mode schema ─────────────────────────────────────────────────────────

const simpleBase = z.object({
  txnType: z.enum(["expense", "income", "transfer"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  description: z.string().min(1, "Description is required").max(500),
  amount: z.string().refine((v) => {
    const n = parseFloat(v);
    return !Number.isNaN(n) && n > 0;
  }, "Amount must be a positive number"),
  paidFrom: z.string().optional(),
  category: z.string().optional(),
  depositedTo: z.string().optional(),
  source: z.string().optional(),
  fromAccount: z.string().optional(),
  toAccount: z.string().optional(),
  memo: z.string().max(500).optional(),
});

export const simpleSchema = simpleBase.refine(
  (d) => {
    if (d.txnType === "expense") return !!(d.paidFrom && d.category);
    if (d.txnType === "income") return !!(d.depositedTo && d.source);
    if (d.txnType === "transfer")
      return !!(d.fromAccount && d.toAccount && d.fromAccount !== d.toAccount);
    return false;
  },
  { message: "Please fill all required account fields", path: ["txnType"] },
);

export type SimpleFormValues = z.infer<typeof simpleSchema>;
