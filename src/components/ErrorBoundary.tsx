import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { logError } from "../lib/logger";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log via console.error as fallback
    console.error(
      "[ErrorBoundary] Uncaught render error:",
      error.stack ?? error.message,
      info.componentStack,
    );
    // Persist to errors.log via Tauri; swallow if invoke fails
    logError(
      error.message,
      (error.stack ?? "") + (info.componentStack ?? ""),
    ).catch(() => {});
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center min-h-screen bg-[var(--color-background)] px-6"
        >
          <div className="max-w-md w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-8 text-center shadow-md">
            <h1 className="text-lg font-semibold text-[var(--color-text)] mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6">
              An unexpected error occurred. Your data is safe — please reload or try again.
            </p>
            {this.state.error && (
              <pre className="text-xs text-left bg-[var(--color-surface-muted)] rounded-lg p-3 mb-6 overflow-auto max-h-40 text-[var(--color-text-secondary)]">
                {this.state.error.message}
              </pre>
            )}
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: "var(--primary)" }}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
