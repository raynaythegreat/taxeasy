import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

/**
 * Reusable button component with consistent styling
 */
export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  const baseStyles = cn(
    "inline-flex items-center justify-center gap-1.5 font-medium transition-colors cursor-pointer",
    "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  );

  const variantStyles = {
    primary: cn(
      "bg-blue-600 text-white rounded-lg hover:bg-blue-700",
      "dark:bg-blue-500 dark:hover:bg-blue-600",
    ),
    secondary: cn(
      "border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50",
      "dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
    ),
    ghost: cn(
      "text-gray-700 rounded-md hover:bg-gray-100",
      "dark:text-slate-300 dark:hover:bg-slate-700",
    ),
    danger: cn(
      "bg-red-600 text-white rounded-lg hover:bg-red-700",
      "dark:bg-red-500 dark:hover:bg-red-600",
    ),
  };

  const sizeStyles = {
    sm: "px-2.5 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
    lg: "px-4 py-2 text-base",
  };

  return (
    <button
      type="button"
      className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}
