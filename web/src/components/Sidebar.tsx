/**
 * 侧边栏 — 会话列表
 */

import { useEffect, useState, useCallback } from "react";
import * as api from "../services/api";
import type { SessionInfo } from "../services/api";
import "./Sidebar.css";

interface SidebarProps {
  readonly activeSessionId: string | null;
  readonly onSelectSession: (sessionId: string) => void;
  readonly onNewChat: () => void;
  readonly refreshKey: number;
}

export function Sidebar({ activeSessionId, onSelectSession, onNewChat, refreshKey }: SidebarProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  const loadSessions = useCallback(async () => {
    const res = await api.listSessions();
    if (res.success && res.data) {
      setSessions(res.data.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions, refreshKey]);

  async function handleDelete(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation();
    await api.deleteSession(sessionId);
    await loadSessions();
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Chats</span>
        <button className="sidebar-new-btn" onClick={onNewChat} title="新对话">
          +
        </button>
      </div>
      <div className="session-list">
        {sessions.length === 0 && (
          <div className="session-empty">No conversations yet</div>
        )}
        {sessions.map((s) => (
          <div
            key={s.sessionId}
            className={`session-item ${s.sessionId === activeSessionId ? "active" : ""}`}
            onClick={() => onSelectSession(s.sessionId)}
          >
            <div className="session-info">
              <span className="session-desc">{s.description}</span>
              <span className="session-meta">
                {s.messageCount} msgs &middot; {formatTime(s.updatedAt)}
              </span>
            </div>
            <button
              className="session-delete"
              onClick={(e) => handleDelete(e, s.sessionId)}
              title="删除"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
