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
  lookup_tax_guidance: FileText,
  search: Search,
  query: Search,
  report: FileText,
  database: Database,
  transaction: Receipt,
};

const TOOL_LABELS: Record<string, { active: string; past: string }> = {
  categorize: { active: "Categorizing transaction...", past: "Categorize" },
  create_transaction: { active: "Creating transaction...", past: "Create Transaction" },
  lookup_tax_guidance: { active: "Researching official tax sources...", past: "Tax Research" },
  query: { active: "Querying ledger...", past: "Query Ledger" },
  report: { active: "Generating report...", past: "Generate Report" },
  search: { active: "Searching...", past: "Search" },
  import: { active: "Importing...", past: "Import" },
};

function isTaxResearchOutput(value: unknown): value is {
  summary?: string;
  sources?: Array<{
    source?: string;
    title?: string;
    summary?: string;
    url?: string;
    published_at?: string;
    confidence?: string;
  }>;
} {
  if (!value || typeof value !== "object") return false;
  const maybe = value as { sources?: unknown };
  return Array.isArray(maybe.sources);
}

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
              {isTaxResearchOutput(toolOutput) ? (
                <div className="space-y-2">
                  {toolOutput.summary && (
                    <div className="rounded bg-white dark:bg-neutral-900 p-2 text-xs text-gray-600 dark:text-neutral-300">
                      {toolOutput.summary}
                    </div>
                  )}
                  {toolOutput.sources?.map((source, index) => (
                    <a
                      key={`${source.url ?? index}`}
                      href={source.url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded border border-gray-200 bg-white p-2 text-xs text-gray-700 hover:border-blue-300 hover:bg-blue-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-blue-700 dark:hover:bg-neutral-800"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-gray-900 dark:text-neutral-100">
                          {source.source ?? "Official source"}
                        </span>
                        {source.confidence && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                            {source.confidence}
                          </span>
                        )}
                      </div>
                      {source.title && (
                        <p className="mt-1 font-medium text-gray-800 dark:text-neutral-200">
                          {source.title}
                        </p>
                      )}
                      {source.summary && (
                        <p className="mt-1 line-clamp-3 text-gray-500 dark:text-neutral-400">
                          {source.summary}
                        </p>
                      )}
                      {source.published_at && (
                        <p className="mt-1 text-[10px] text-gray-400 dark:text-neutral-500">
                          {source.published_at}
                        </p>
                      )}
                    </a>
                  ))}
                </div>
              ) : (
                <pre className="text-xs bg-white dark:bg-neutral-900 rounded p-2 overflow-auto max-h-40 font-mono text-gray-600 dark:text-neutral-400">
                  {JSON.stringify(toolOutput, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
