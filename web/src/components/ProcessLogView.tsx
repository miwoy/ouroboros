/**
 * 过程日志面板
 *
 * 时间戳 + 日志级别颜色标签 + 消息 + 工具ID + 时长
 * 自动滚动 + 手动暂停 + 统计栏
 */

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
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

/** 日志级别中文 */
function levelLabel(level: string): string {
  const labels: Record<string, string> = {
    step: "STEP",
    model: "MODEL",
    tool: "TOOL",
    error: "ERROR",
  };
  return labels[level] ?? level.toUpperCase();
}

/** 格式化时间戳 HH:MM:SS.mmm */
function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    return `${h}:${m}:${s}.${ms}`;
  } catch {
    return ts;
  }
}

/** 格式化时长 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m${Math.floor((ms % 60_000) / 1000)}s`;
}

/** 统计栏 */
function LogStats({ logs }: { readonly logs: readonly ProcessLogEntry[] }) {
  const stats = useMemo(() => {
    let steps = 0;
    let tools = 0;
    let errors = 0;
    let totalDuration = 0;
    for (const log of logs) {
      if (log.level === "step") steps++;
      else if (log.level === "tool") tools++;
      else if (log.level === "error") errors++;
      if (log.duration) totalDuration += log.duration;
    }
    return { steps, tools, errors, totalDuration };
  }, [logs]);

  return (
    <div className="log-stats-bar">
      <span className="log-stat">
        <span className="log-stat-dot log-step" /> {stats.steps} 步骤
      </span>
      <span className="log-stat">
        <span className="log-stat-dot log-tool" /> {stats.tools} 工具
      </span>
      {stats.errors > 0 && (
        <span className="log-stat log-stat-error">
          <span className="log-stat-dot log-error" /> {stats.errors} 错误
        </span>
      )}
      {stats.totalDuration > 0 && (
        <span className="log-stat log-stat-duration">
          &#x23F1; {formatDuration(stats.totalDuration)}
        </span>
      )}
      <span className="log-stat log-stat-count">{logs.length} 条</span>
    </div>
  );
}

export function ProcessLogView({ logs }: ProcessLogViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    setAutoScroll(atBottom);
  }, []);

  if (logs.length === 0) {
    return (
      <div className="process-log-view process-log-empty">
        <div className="log-empty-icon">&#x23F3;</div>
        <div>等待执行...</div>
      </div>
    );
  }

  return (
    <div className="process-log-wrapper">
      <LogStats logs={logs} />
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
            <span className={`log-level-badge ${levelClass(entry.level)}`}>
              {levelLabel(entry.level)}
            </span>
            {entry.toolId && (
              <span className="log-tool-id">{entry.toolId}</span>
            )}
            <span className="log-message">{entry.message}</span>
            {entry.duration != null && (
              <span className="log-duration">{formatDuration(entry.duration)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
