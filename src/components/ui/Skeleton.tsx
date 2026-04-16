import { cn } from "../../lib/utils";

type SkeletonVariant = "line" | "card" | "circle";

interface SkeletonProps {
  variant?: SkeletonVariant;
  className?: string;
  /** Number of lines to render when variant="line" */
  lines?: number;
}

export function Skeleton({ variant = "line", className, lines = 1 }: SkeletonProps) {
  const base = "animate-pulse bg-gray-200 dark:bg-slate-700";

  if (variant === "circle") {
    return <div className={cn(base, "rounded-full w-10 h-10", className)} />;
  }

  if (variant === "card") {
    return <div className={cn(base, "rounded-xl w-full h-32", className)} />;
  }

  // variant === "line"
  if (lines === 1) {
    return <div className={cn(base, "rounded h-4 w-full", className)} />;
  }

  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => `sk-${i}`).map((key, i) => (
        <div key={key} className={cn(base, "rounded h-4", i === lines - 1 ? "w-3/4" : "w-full")} />
      ))}
    </div>
  );
}
