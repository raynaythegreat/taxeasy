import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Trash2, User, Bot, Loader2, MessageSquare } from "lucide-react";
import { getChatHistory, sendChatMessage, clearChatHistory } from "../../lib/ai-api";
import { cn } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";

export function ChatPanel({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["chatHistory", clientId],
    queryFn: () => getChatHistory(clientId),
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) => sendChatMessage(clientId, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatHistory", clientId] });
      queryClient.invalidateQueries({ queryKey: ["drafts", clientId] });
    },
    onError: (err) => {
      console.error("Chat error:", err);
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => clearChatHistory(clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatHistory", clientId] });
      setShowClearConfirm(false);
    },
  });

  const allMessages = [
    ...messages,
    ...(sendMutation.isPending
      ? [{ id: "pending", clientId, role: "user", content: input, evidenceId: null, createdAt: new Date().toISOString() }]
      : []),
    ...(sendMutation.isPending
      ? [{ id: "thinking", clientId, role: "assistant", content: "", evidenceId: null, createdAt: new Date().toISOString() }]
      : []),
  ];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allMessages.length, sendMutation.isPending]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed, { onSettled: () => setInput("") });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-end px-4 py-2 bg-white dark:bg-neutral-900 border-b border-gray-100 dark:border-neutral-800">
        {showClearConfirm ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-neutral-400">
              {t("ai.clearHistoryConfirm")}
            </span>
            <button
              type="button"
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
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
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-500 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t("ai.clearHistory")}
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : allMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-12 h-12 bg-gray-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6 text-gray-400 dark:text-neutral-500" />
            </div>
            <p className="text-sm text-gray-500 dark:text-neutral-400">{t("ai.noMessages")}</p>
          </div>
        ) : (
          allMessages.map((msg) => {
            if (msg.id === "thinking") {
              return (
                <div key={msg.id} className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-gray-500 dark:text-neutral-400" />
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="ml-2">{t("ai.thinking")}</span>
                  </div>
                </div>
              );
            }

            const isUser = msg.role === "user";

            return (
              <div
                key={msg.id}
                className={cn("flex items-start gap-2.5", isUser && "flex-row-reverse")}
              >
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                    isUser
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-neutral-800"
                  )}
                >
                  {isUser ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <Bot className="w-4 h-4 text-gray-500 dark:text-neutral-400" />
                  )}
                </div>
                <div
                  className={cn(
                    "max-w-[70%] px-3.5 py-2.5 rounded-lg text-sm",
                    isUser
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-neutral-800 text-gray-900 dark:text-neutral-100"
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <span
                    className={cn(
                      "block mt-1 text-[10px]",
                      isUser
                        ? "text-blue-200"
                        : "text-gray-400 dark:text-neutral-500"
                    )}
                  >
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="shrink-0 px-4 py-3 bg-white dark:bg-neutral-900 border-t border-gray-200 dark:border-neutral-700">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("ai.chatPlaceholder")}
            disabled={sendMutation.isPending}
            className="flex-1 px-3.5 py-2 text-sm border border-gray-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-gray-900 dark:text-neutral-100 placeholder-gray-400 dark:placeholder-neutral-500 focus:outline-none focus:border-blue-500 dark:focus:border-blue-500 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || sendMutation.isPending}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
