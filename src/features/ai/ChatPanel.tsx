import { ArrowDown, Bot, Loader2, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "../../contexts/SettingsContext";
import { type ChatMessage, clearChatHistory, type ToolCallRecord } from "../../lib/ai-api";
import { useI18n } from "../../lib/i18n";
import { checkAiHealthWithUrl } from "../../lib/settings-api";
import { useChatStream } from "../../lib/use-chat-stream";
import { cn } from "../../lib/utils";
import { MessageBubble } from "./MessageBubble";
import { SlashCommandInput } from "./SlashCommandInput";
import { ToolCallBlock } from "./ToolCallBlock";

interface ChatPanelProps {
  clientId: string;
}

const SUGGESTED_PROMPTS = [
  "What were my top expenses this month?",
  "Create a transaction for office supplies",
  "Show me my P&L for this quarter",
  "Categorize my recent transactions",
];

type ModelStatus = "online" | "offline" | "checking";

function groupMessagesIntoTurns(messages: ChatMessage[]): (ChatMessage | ChatMessage[])[] {
  if (messages.length === 0) return [];
  const turns: (ChatMessage | ChatMessage[])[] = [];
  let currentTurn: ChatMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      if (currentTurn.length > 0) {
        turns.push(currentTurn.length === 1 ? currentTurn[0] : [...currentTurn]);
      }
      turns.push(msg);
      currentTurn = [];
    } else {
      currentTurn.push(msg);
    }
  }
  if (currentTurn.length > 0) {
    turns.push(currentTurn.length === 1 ? currentTurn[0] : [...currentTurn]);
  }
  return turns;
}

function shouldShowTimestamp(prev: ChatMessage | undefined, current: ChatMessage): boolean {
  if (!prev) return true;
  const diff = new Date(current.createdAt).getTime() - new Date(prev.createdAt).getTime();
  return diff > 5 * 60 * 1000;
}

function formatTimestampHeader(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatPanel({ clientId }: ChatPanelProps) {
  const { t } = useI18n();
  const { ai_provider, ollama_url, lm_studio_url, settingsLoaded } = useSettings();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelStatus>("checking");
  const [error, setError] = useState<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const lastMessageCountRef = useRef(0);

  const { messages, streamingMessage, toolCalls, isStreaming, send } = useChatStream({ clientId });

  useEffect(() => {
    if (!settingsLoaded) return;

    let cancelled = false;
    let intervalId: number | null = null;

    const checkHealth = async () => {
      if (cancelled) return;
      setModelStatus("checking");

      const providerUrl = ai_provider === "lmstudio" ? lm_studio_url : ollama_url;
      console.log("[AI Health] Checking provider:", ai_provider, "at URL:", providerUrl);

      try {
        const isOnline = await checkAiHealthWithUrl(providerUrl);
        console.log("[AI Health] Check result:", isOnline);
        if (!cancelled) {
          setModelStatus(isOnline ? "online" : "offline");

          // If offline, check more frequently (every 5 seconds)
          // If online, check less frequently (every 30 seconds)
          if (intervalId) clearInterval(intervalId);
          const pollInterval = isOnline ? 30000 : 5000;
          intervalId = window.setInterval(checkHealth, pollInterval);
        }
      } catch (error) {
        console.log("[AI Health] Check failed:", error);
        if (!cancelled) {
          setModelStatus("offline");
          // On error, check more frequently
          if (intervalId) clearInterval(intervalId);
          intervalId = window.setInterval(checkHealth, 5000);
        }
      }
    };

    // Initial check
    checkHealth();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [settingsLoaded, ai_provider, ollama_url, lm_studio_url]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 80;
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold);
  }, []);

  useEffect(() => {
    if (!isAtBottom) return;
    if (messages.length === lastMessageCountRef.current && !streamingMessage) return;
    lastMessageCountRef.current = messages.length;
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, streamingMessage, isAtBottom]);

  useEffect(() => {
    if (streamingMessage) {
      const el = scrollRef.current;
      if (el && isAtBottom) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [streamingMessage, isAtBottom]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      setIsAtBottom(true);
    }
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setInputValue("");
    setError(null);
    send(trimmed);
  }, [inputValue, send]);

  const handleClear = useCallback(async () => {
    try {
      await clearChatHistory(clientId);
      setShowClearConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear history");
    }
  }, [clientId]);

  const turns = useMemo(() => groupMessagesIntoTurns(messages), [messages]);

  const allRendered = useMemo(() => {
    const items: {
      type: "timestamp" | "message" | "turn";
      timestamp?: string;
      message?: ChatMessage;
      turn?: ChatMessage[];
    }[] = [];

    let prev: ChatMessage | undefined;
    for (const turn of turns) {
      const first = Array.isArray(turn) ? turn[0] : turn;
      if (shouldShowTimestamp(prev, first)) {
        items.push({ type: "timestamp", timestamp: first.createdAt });
      }

      if (Array.isArray(turn)) {
        items.push({ type: "turn", turn });
        prev = turn[turn.length - 1];
      } else {
        items.push({ type: "message", message: turn });
        prev = turn;
      }
    }

    return items;
  }, [turns]);

  const isEmpty = messages.length === 0 && !streamingMessage;

  const handleSuggestionClick = useCallback((prompt: string) => {
    setInputValue(prompt);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-white dark:bg-neutral-900 border-b border-gray-100 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-2 h-2 rounded-full",
              modelStatus === "online" && "bg-green-500",
              modelStatus === "offline" && "bg-red-500",
              modelStatus === "checking" && "bg-yellow-500 animate-pulse",
            )}
          />
          <span className="text-xs text-gray-500 dark:text-neutral-400">
            {modelStatus === "online" && t("ai.localBadge")}
            {modelStatus === "offline" && "Offline"}
            {modelStatus === "checking" && "..."}
          </span>
        </div>

        {showClearConfirm ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-neutral-400">
              {t("ai.clearHistoryConfirm")}
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="px-2 py-0.5 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700"
            >
              {t("ai.yes")}
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(false)}
              className="px-2 py-0.5 text-xs font-medium rounded border border-gray-300 dark:border-neutral-600 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800"
            >
              {t("ai.no")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            disabled={messages.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-500 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t("ai.clearHistory")}
          </button>
        )}
      </div>

      {error && (
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800">
          <span className="text-xs text-red-700 dark:text-red-400 flex-1 truncate">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="p-0.5 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-auto px-4 py-4">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 bg-gray-100 dark:bg-neutral-800 rounded-2xl flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-gray-400 dark:text-neutral-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-neutral-100 mb-1">
              {t("ai.workspaceTitle")}
            </h3>
            <p className="text-sm text-gray-500 dark:text-neutral-400 mb-8 max-w-sm">
              {t("ai.noMessages")}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSuggestionClick(prompt)}
                  className="text-left px-3 py-2.5 text-sm text-gray-700 dark:text-neutral-300 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {allRendered.map((item, idx) => {
              const stableKey =
                item.type === "timestamp" && item.timestamp
                  ? `ts-${item.timestamp}`
                  : item.type === "turn" && item.turn
                    ? `turn-${item.turn.map((m) => m.id).join("+")}`
                    : item.type === "message" && item.message
                      ? `msg-${item.message.id}`
                      : `item-${idx}`;

              if (item.type === "timestamp" && item.timestamp) {
                return (
                  <div key={stableKey} className="flex items-center justify-center py-3">
                    <span className="text-[10px] font-medium text-gray-400 dark:text-neutral-500 bg-gray-50 dark:bg-neutral-900 px-2.5 py-0.5 rounded-full">
                      {formatTimestampHeader(item.timestamp)}
                    </span>
                  </div>
                );
              }

              if (item.type === "turn" && item.turn) {
                return (
                  <div
                    key={stableKey}
                    className="ml-3 pl-3 border-l-2 border-blue-200 dark:border-blue-800 space-y-2 py-1"
                  >
                    {item.turn.map((msg) => (
                      <MessageBubble key={msg.id} message={msg} />
                    ))}
                  </div>
                );
              }

              if (item.type === "message" && item.message) {
                return <MessageBubble key={stableKey} message={item.message} />;
              }

              return null;
            })}

            {isStreaming && streamingMessage && (
              <div className="ml-3 pl-3 border-l-2 border-blue-200 dark:border-blue-800 space-y-2 py-1">
                {toolCalls && toolCalls.length > 0 && (
                  <div className="space-y-2">
                    {toolCalls.map((tc: ToolCallRecord) => (
                      <ToolCallBlock
                        key={tc.id}
                        toolName={tc.toolName}
                        toolInput={tc.toolInput}
                        toolOutput={tc.toolOutput}
                        status={tc.status}
                      />
                    ))}
                  </div>
                )}
                <MessageBubble message={streamingMessage} streaming />
              </div>
            )}

            {isStreaming && !streamingMessage && (
              <div className="flex items-center gap-2 py-2 ml-3 pl-3 border-l-2 border-blue-200 dark:border-blue-800">
                <Loader2 className="w-4 h-4 text-gray-400 dark:text-neutral-500 animate-spin" />
                <span className="text-xs text-gray-500 dark:text-neutral-400">
                  {t("ai.thinking")}
                </span>
              </div>
            )}

            <div className="h-4" />
          </div>
        )}
      </div>

      {!isAtBottom && !isEmpty && (
        <div className="shrink-0 flex justify-center -mt-0 relative z-10">
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute -top-10 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-full shadow-sm hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors"
          >
            <ArrowDown className="w-3 h-3" />
            New messages
          </button>
        </div>
      )}

      <div className="shrink-0 px-4 py-3 bg-white dark:bg-neutral-900 border-t border-gray-200 dark:border-neutral-700">
        <div className="flex items-end gap-2">
          <SlashCommandInput
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            disabled={isStreaming}
            placeholder={t("ai.chatPlaceholder")}
          />
        </div>
      </div>
    </div>
  );
}
