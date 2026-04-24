import { FileText, HelpCircle, Mic, MicOff, Search, Send, Tag, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SLASH_COMMANDS } from "../../lib/ai-api";
import { cn } from "../../lib/utils";

const ICON_MAP: Record<string, typeof Upload> = {
  Upload,
  Search,
  FileText,
  Tag,
  HelpCircle,
};

interface SlashCommandInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  onVoiceResult?: (transcript: string) => void;
}

export function SlashCommandInput({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  onVoiceResult,
}: SlashCommandInputProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const hasSpeech = !!SpeechRecognition;

  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (onVoiceResult) {
        onVoiceResult(transcript);
      } else {
        onChange(transcript);
      }
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }, [isListening, SpeechRecognition, onChange, onVoiceResult]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const filterText = value.startsWith("/") ? value.toLowerCase() : "";
  const filtered = SLASH_COMMANDS.filter(
    (c) =>
      c.command.startsWith(filterText) || c.label.toLowerCase().startsWith(filterText.slice(1)),
  );

  const shouldShowMenu = showMenu && filterText.length > 0 && filtered.length > 0;

  const selectCommand = useCallback(
    (cmd: (typeof SLASH_COMMANDS)[number]) => {
      onChange(`${cmd.command} `);
      setShowMenu(false);
      inputRef.current?.focus();
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (shouldShowMenu) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % filtered.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          selectCommand(filtered[selectedIndex]);
          return;
        }
        if (e.key === "Escape") {
          setShowMenu(false);
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [shouldShowMenu, filtered, selectedIndex, selectCommand, onSend],
  );

  useEffect(() => {
    if (value.startsWith("/")) {
      setShowMenu(true);
      setSelectedIndex(0);
    } else {
      setShowMenu(false);
    }
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative flex-1">
      {shouldShowMenu && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-lg overflow-hidden z-10">
          {filtered.map((cmd, i) => {
            const Icon = ICON_MAP[cmd.icon] ?? Search;
            return (
              <button
                key={cmd.command}
                type="button"
                onClick={() => selectCommand(cmd)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={cn(
                  "flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors",
                  i === selectedIndex
                    ? "bg-blue-50 dark:bg-blue-900/20"
                    : "hover:bg-gray-50 dark:hover:bg-neutral-700/50",
                )}
              >
                <Icon className="w-4 h-4 text-gray-400 dark:text-neutral-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-neutral-100">
                    {cmd.command}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-neutral-400 truncate">
                    {cmd.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "Ask about this client's books..."}
          disabled={disabled}
          className="flex-1 px-3.5 py-2 text-sm border border-gray-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-gray-900 dark:text-neutral-100 placeholder-gray-400 dark:placeholder-neutral-500 focus:outline-none focus:border-blue-500 dark:focus:border-blue-500 disabled:opacity-50"
        />
        {hasSpeech && (
          <button
            type="button"
            onClick={toggleListening}
            disabled={disabled}
            className={cn(
              "flex items-center justify-center w-9 h-9 rounded-lg transition-colors",
              isListening
                ? "bg-red-500 text-white hover:bg-red-600 animate-pulse"
                : "bg-gray-100 dark:bg-neutral-700 text-gray-500 dark:text-neutral-400 hover:bg-gray-200 dark:hover:bg-neutral-600",
            )}
            title={isListening ? "Stop listening" : "Start voice input"}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={onSend}
          disabled={!value.trim() || disabled}
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
