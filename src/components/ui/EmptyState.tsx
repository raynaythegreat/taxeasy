import type { ReactNode } from "react";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)] mb-4">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--color-text-secondary)] max-w-xs mb-4">{description}</p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: "var(--primary)" }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
