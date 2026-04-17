import { Bot, Copy, User } from "lucide-react";
import { useCallback, useState } from "react";
import type { ChatMessage, ToolCallRecord } from "../../lib/ai-api";
import { cn } from "../../lib/utils";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ToolCallBlock } from "./ToolCallBlock";
import { TransactionCard } from "./TransactionCard";

interface MessageBubbleProps {
  message: ChatMessage;
  streaming?: boolean;
  toolCalls?: ToolCallRecord[];
  accounts?: Array<{ id: string; code: string; name: string }>;
  onApproveDraft?: (id: string) => void;
  onRejectDraft?: (id: string) => void;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function extractDrafts(content: string): Array<{
  id: string;
  date: string | null;
  description: string | null;
  amount: number | null;
  debitAccountId: string | null;
  creditAccountId: string | null;
  status: string;
}> {
  try {
    const match = content.match(/```draft\n([\s\S]*?)```/);
    if (!match) return [];
    return JSON.parse(match[1]);
  } catch {
    return [];
  }
}

export function MessageBubble({
  message,
  streaming,
  toolCalls,
  accounts,
  onApproveDraft,
  onRejectDraft,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isToolCall = message.role === "tool_call";
  const isToolResult = message.role === "tool_result";
  const hasToolCalls = toolCalls && toolCalls.length > 0;
  const drafts = !isUser ? extractDrafts(message.content) : [];

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [message.content]);

  if (isToolCall && toolCalls?.length) {
    return (
      <div className="space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
        {toolCalls.map((tc) => (
          <ToolCallBlock
            key={tc.id}
            toolName={tc.toolName}
            toolInput={tc.toolInput}
            toolOutput={tc.toolOutput}
            status={tc.status}
          />
        ))}
      </div>
    );
  }

  if (isToolResult) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50 px-3 py-2 text-xs text-gray-600 dark:text-neutral-400 animate-in fade-in duration-200">
        <details>
          <summary className="cursor-pointer text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200">
            Tool Result
          </summary>
          <pre className="mt-2 overflow-auto max-h-40 text-[11px] font-mono">{message.content}</pre>
        </details>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 group animate-in fade-in slide-in-from-bottom-1 duration-200",
        isUser && "flex-row-reverse",
        hasToolCalls && "pl-3 border-l-2 border-blue-300 dark:border-blue-700",
      )}
    >
      <div
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
          isUser ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-neutral-800",
        )}
      >
        {isUser ? (
          <User className="w-4 h-4" />
        ) : (
          <Bot className="w-4 h-4 text-gray-500 dark:text-neutral-400" />
        )}
      </div>

      <div className={cn("max-w-[75%] relative", isUser && "flex flex-col items-end")}>
        <div
          className={cn(
            "px-3.5 py-2.5 rounded-lg text-sm",
            isUser
              ? "bg-blue-600 text-white"
              : "bg-gray-100 dark:bg-neutral-800 text-gray-900 dark:text-neutral-100",
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <>
              <MarkdownRenderer content={message.content} />
              {streaming && (
                <span className="inline-block w-1.5 h-4 ml-0.5 bg-gray-400 dark:bg-neutral-500 animate-pulse rounded-sm" />
              )}
            </>
          )}
        </div>

        {drafts.length > 0 && (
          <div className="mt-2 space-y-2 w-full">
            {drafts.map((d) => (
              <TransactionCard
                key={d.id}
                draft={d}
                accounts={accounts}
                onApprove={onApproveDraft}
                onReject={onRejectDraft}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <span
            className={cn(
              "text-[10px]",
              isUser ? "text-blue-200" : "text-gray-400 dark:text-neutral-500",
            )}
          >
            {relativeTime(message.createdAt)}
          </span>

          {!isUser && (
            <button
              type="button"
              onClick={handleCopy}
              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors"
              title="Copy"
            >
              <Copy
                className={cn(
                  "w-3 h-3",
                  copied ? "text-green-500" : "text-gray-400 dark:text-neutral-500",
                )}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
