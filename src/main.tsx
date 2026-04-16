import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ToastProvider, useToast } from "./components/ui/Toast";
import { I18nProvider } from "./lib/i18n";
import { SidebarProvider } from "./lib/sidebar";
import { ThemeProvider } from "./lib/theme";
import "./index.css";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  if (typeof err === "string" && err.trim()) {
    return err;
  }
  if (err && typeof err === "object") {
    if ("message" in err && typeof err.message === "string" && err.message.trim()) {
      return err.message;
    }
    if ("error" in err && typeof err.error === "string" && err.error.trim()) {
      return err.error;
    }
    try {
      const serialized = JSON.stringify(err);
      if (serialized && serialized !== "{}") {
        return serialized;
      }
    } catch {
      // Fall through to the generic message below.
    }
  }
  return "Request failed";
}

// Inner component so useToast can access the ToastProvider above it
function AppWithQueryClient() {
  const toast = useToast();

  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 5_000 },
        },
        queryCache: new QueryCache({
          onError: (err, query) => {
            // Opt-out per-query via meta: { silent: true }
            if (query.meta?.silent) return;
            toast.error(getErrorMessage(err));
          },
        }),
        mutationCache: new MutationCache({
          onError: (err) => {
            toast.error(getErrorMessage(err));
          },
        }),
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ThemeProvider>
          <SidebarProvider>
            <App />
          </SidebarProvider>
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ToastProvider>
      <AppWithQueryClient />
    </ToastProvider>
  </React.StrictMode>,
);
