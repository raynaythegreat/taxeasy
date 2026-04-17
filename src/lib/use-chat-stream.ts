import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ChatMessage,
  type StreamEvent,
  type ToolCallRecord,
  getChatHistory,
  listenChatStream,
  sendChatMessageStream,
} from "./ai-api";

interface UseChatStreamOptions {
  clientId: string;
}

interface UseChatStreamReturn {
  messages: ChatMessage[];
  streamingMessage: ChatMessage | null;
  toolCalls: ToolCallRecord[];
  isStreaming: boolean;
  error: string | null;
  send: (message: string) => Promise<void>;
  reload: () => void;
  clearError: () => void;
}

export function useChatStream({ clientId }: UseChatStreamOptions): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessage | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const loadHistory = useCallback(async () => {
    try {
      const history = await getChatHistory(clientId);
      setMessages(history);
    } catch (e) {
      console.error("Failed to load chat history:", e);
    }
  }, [clientId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const send = useCallback(
    async (message: string) => {
      if (isStreaming) return;
      setIsStreaming(true);
      setError(null);
      setToolCalls([]);
      abortRef.current = false;

      const userMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        clientId,
        role: "user",
        content: message,
        evidenceId: null,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);

      const assistantId = `stream-${Date.now()}`;
      let accumulated = "";

      setStreamingMessage({
        id: assistantId,
        clientId,
        role: "assistant",
        content: "",
        evidenceId: null,
        createdAt: new Date().toISOString(),
      });

      try {
        const unlisten = await listenChatStream((event: StreamEvent) => {
          if (abortRef.current) return;

          switch (event.type) {
            case "start":
              if (event.messageId) {
                setStreamingMessage((prev) => (prev ? { ...prev, id: event.messageId! } : prev));
              }
              break;

            case "delta":
              accumulated += event.delta ?? "";
              setStreamingMessage((prev) => (prev ? { ...prev, content: accumulated } : prev));
              break;

            case "tool_call":
              setToolCalls((prev) => [
                ...prev,
                {
                  id: `tc-${Date.now()}-${prev.length}`,
                  toolName: event.toolName ?? "unknown",
                  toolInput: event.toolInput,
                  toolOutput: undefined,
                  status: event.toolStatus ?? "running",
                },
              ]);
              break;

            case "tool_progress":
              break;

            case "tool_result":
              setToolCalls((prev) =>
                prev.map((tc) =>
                  tc.toolName === event.toolName && tc.status === "running"
                    ? { ...tc, toolOutput: event.toolOutput, status: "completed" }
                    : tc,
                ),
              );
              break;

            case "error":
              setError(event.error ?? "Unknown error");
              break;

            case "end":
              break;
          }
        });

        await sendChatMessageStream(clientId, message);

        unlisten();

        await loadHistory();

        setStreamingMessage(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStreamingMessage(null);
      } finally {
        setIsStreaming(false);
      }
    },
    [clientId, isStreaming, loadHistory],
  );

  return {
    messages,
    streamingMessage,
    toolCalls,
    isStreaming,
    error,
    send,
    reload: loadHistory,
    clearError: () => setError(null),
  };
}
