import { Bug, Maximize2, Minimize2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface LogEntry {
  timestamp: string;
  level: "log" | "warn" | "error" | "info" | "debug";
  message: string;
}

interface ConsoleViewerProps {
  onClose?: () => void;
}

export function ConsoleViewer({ onClose }: ConsoleViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;
    const originalDebug = console.debug;

    const addLog = (level: LogEntry["level"], ...args: any[]) => {
      const message = args
        .map((arg) => {
          if (typeof arg === "object") {
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(" ");

      setLogs((prev) => [
        ...prev.slice(-100),
        {
          timestamp: new Date().toLocaleTimeString(),
          level,
          message,
        },
      ]);
    };

    console.log = (...args: any[]) => addLog("log", ...args);
    console.warn = (...args: any[]) => addLog("warn", ...args);
    console.error = (...args: any[]) => addLog("error", ...args);
    console.info = (...args: any[]) => addLog("info", ...args);
    console.debug = (...args: any[]) => addLog("debug", ...args);

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      console.info = originalInfo;
      console.debug = originalDebug;
    };
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const getLevelColor = (level: LogEntry["level"]) => {
    switch (level) {
      case "error":
        return "text-red-600 dark:text-red-400";
      case "warn":
        return "text-yellow-600 dark:text-yellow-400";
      case "info":
        return "text-blue-600 dark:text-blue-400";
      case "debug":
        return "text-gray-500 dark:text-gray-400";
      default:
        return "text-gray-700 dark:text-gray-300";
    }
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-gray-900 dark:bg-gray-800 text-white rounded-lg shadow-lg border border-gray-700">
        <button
          onClick={() => setIsMinimized(false)}
          className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          title="Expand Console"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="absolute -top-2 -right-2 p-1 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors"
            title="Close console"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  if (isMaximized) {
    return (
      <div className="fixed inset-4 z-50 bg-gray-900 dark:bg-gray-800 text-white rounded-lg shadow-2xl border border-gray-700 flex flex-col">
        <div className="flex items-center justify-between p-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold">Console Logs</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={clearLogs}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
            >
              Clear
            </button>
            <button
              onClick={() => setIsMaximized(false)}
              className="p-1 hover:bg-gray-800 rounded transition-colors"
              title="Restore"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            {onClose ? (
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-800 text-red-400 hover:text-red-300 rounded transition-colors"
                title="Close console"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => {
                  setIsMaximized(false);
                  setIsMinimized(true);
                }}
                className="p-1 hover:bg-gray-800 rounded transition-colors"
                title="Minimize"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div ref={logContainerRef} className="flex-1 overflow-auto p-3 font-mono text-xs space-y-1">
          {logs.map((log, index) => (
            <div key={index} className={getLevelColor(log.level)}>
              <span className="text-gray-500 mr-2">[{log.timestamp}]</span>
              <span className="font-semibold mr-2">{log.level}:</span>
              <span className="whitespace-pre-wrap">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-h-64 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg shadow-2xl flex flex-col">
      <div className="flex items-center justify-between p-2 border-b border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Console</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearLogs}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Clear logs"
          >
            <X className="w-3 h-3" />
          </button>
          <button
            onClick={() => setIsMaximized(true)}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Maximize"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Minimize"
          >
            <Minimize2 className="w-3 h-3" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-red-200 dark:hover:bg-red-900 text-red-600 dark:text-red-400 rounded transition-colors"
              title="Close console"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <div
        ref={logContainerRef}
        className="flex-1 overflow-auto p-2 font-mono text-xs space-y-0.5 bg-white dark:bg-gray-900"
      >
        {logs.map((log, index) => (
          <div key={index} className={getLevelColor(log.level)}>
            <span className="text-gray-400 mr-1">[{log.timestamp}]</span>
            <span className="mr-1">{log.level}:</span>
            <span className="whitespace-pre-wrap break-all">{log.message}</span>
          </div>
        ))}
        {logs.length === 0 && <div className="text-gray-400 text-center py-4">No logs yet...</div>}
      </div>
    </div>
  );
}
