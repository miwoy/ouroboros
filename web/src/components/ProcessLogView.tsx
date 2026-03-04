/**
 * 过程日志面板
 *
 * 时间戳 + 日志级别颜色 + 消息，自动滚动 + 手动暂停。
 */

import { useRef, useEffect, useState, useCallback } from "react";
import type { ProcessLogEntry } from "../hooks/useChat";
import "./ProcessLogView.css";

interface ProcessLogViewProps {
  readonly logs: readonly ProcessLogEntry[];
}

/** 日志级别 → 颜色类名 */
function levelClass(level: string): string {
  const map: Record<string, string> = {
    step: "log-step",
    model: "log-model",
    tool: "log-tool",
    error: "log-error",
  };
  return map[level] ?? "log-step";
}

/** 格式化时间戳 */
function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

export function ProcessLogView({ logs }: ProcessLogViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // 检测手动滚动
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    setAutoScroll(atBottom);
  }, []);

  if (logs.length === 0) {
    return (
      <div className="process-log-view process-log-empty">
        等待执行...
      </div>
    );
  }

  return (
    <div className="process-log-view" ref={containerRef} onScroll={handleScroll}>
      {!autoScroll && (
        <button
          className="log-scroll-btn"
          onClick={() => {
            setAutoScroll(true);
            containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" });
          }}
        >
          &#x2193; 滚动到底部
        </button>
      )}
      {logs.map((entry, i) => (
        <div key={i} className={`log-entry ${levelClass(entry.level)}`}>
          <span className="log-time">{formatTime(entry.timestamp)}</span>
          <span className={`log-level-badge ${levelClass(entry.level)}`}>{entry.level}</span>
          <span className="log-message">{entry.message}</span>
          {entry.duration != null && (
            <span className="log-duration">{entry.duration}ms</span>
          )}
        </div>
      ))}
    </div>
  );
}
