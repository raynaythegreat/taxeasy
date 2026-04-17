import {
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  Loader2,
  Receipt,
  Search,
  Tag,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";

interface ToolCallBlockProps {
  toolName: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  status: "pending" | "running" | "completed" | "error";
}

const TOOL_ICONS: Record<string, typeof Search> = {
  categorize: Tag,
  search: Search,
  query: Search,
  report: FileText,
  database: Database,
  transaction: Receipt,
};

const TOOL_LABELS: Record<string, { active: string; past: string }> = {
  categorize: { active: "Categorizing transaction...", past: "Categorize" },
  create_transaction: { active: "Creating transaction...", past: "Create Transaction" },
  query: { active: "Querying ledger...", past: "Query Ledger" },
  report: { active: "Generating report...", past: "Generate Report" },
  search: { active: "Searching...", past: "Search" },
  import: { active: "Importing...", past: "Import" },
};

export function ToolCallBlock({ toolName, toolInput, toolOutput, status }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const Icon = TOOL_ICONS[toolName] ?? Search;
  const labels = TOOL_LABELS[toolName] ?? { active: `${toolName}...`, past: toolName };
  const isActive = status === "running" || status === "pending";

  return (
    <div
      className={cn(
        "rounded-lg border text-sm transition-all duration-200",
        status === "error"
          ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
          : status === "completed"
            ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
            : "border-gray-200 bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800/50",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        )}

        <Icon className="w-3.5 h-3.5 text-gray-500 dark:text-neutral-400 shrink-0" />

        <span className="flex-1 truncate text-gray-700 dark:text-neutral-300">
          {isActive ? labels.active : labels.past}
        </span>

        {status === "running" && (
          <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
        )}
        {status === "pending" && <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />}
        {status === "completed" && (
          <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400 shrink-0" />
        )}
        {status === "error" && (
          <X className="w-3.5 h-3.5 text-red-500 dark:text-red-400 shrink-0" />
        )}
      </button>

      {expanded && (toolInput !== undefined || toolOutput !== undefined) && (
        <div className="border-t border-gray-200 dark:border-neutral-700 px-3 py-2 space-y-2">
          {toolInput !== undefined && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-neutral-500 mb-1">
                Input
              </p>
              <pre className="text-xs bg-white dark:bg-neutral-900 rounded p-2 overflow-auto max-h-40 font-mono text-gray-600 dark:text-neutral-400">
                {JSON.stringify(toolInput, null, 2)}
              </pre>
            </div>
          )}
          {toolOutput !== undefined && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-neutral-500 mb-1">
                Output
              </p>
              <pre className="text-xs bg-white dark:bg-neutral-900 rounded p-2 overflow-auto max-h-40 font-mono text-gray-600 dark:text-neutral-400">
                {JSON.stringify(toolOutput, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
