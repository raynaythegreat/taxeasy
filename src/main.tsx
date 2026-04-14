import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./lib/theme";
import { SidebarProvider } from "./lib/sidebar";
import { I18nProvider } from "./lib/i18n";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5_000 },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ThemeProvider>
          <SidebarProvider>
            <App />
          </SidebarProvider>
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
