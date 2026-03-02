/**
 * 系统监控面板
 */

import { useEffect, useState } from "react";
import * as api from "../services/api";
import type { HealthData, SessionInfo } from "../services/api";
import { useExecutionTree } from "../hooks/useExecutionTree";
import { ExecutionTreeView } from "../components/ExecutionTreeView";
import "./MonitorPage.css";

export function MonitorPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const { tree, loading: treeLoading, error: treeError, streaming, loadTree, subscribe, unsubscribe } = useExecutionTree();

  useEffect(() => {
    loadHealth();
    loadSessions();
    const timer = setInterval(loadHealth, 5000);
    return () => clearInterval(timer);
  }, []);

  // 选择会话时加载执行树快照
  useEffect(() => {
    if (selectedSessionId) {
      loadTree(selectedSessionId);
    }
  }, [selectedSessionId, loadTree]);

  async function loadHealth() {
    try {
      const res = await api.getHealth();
      if (res.success && res.data) {
        setHealth(res.data);
        setError(null);
      } else {
        setError(res.error?.message || "Health check failed");
      }
    } catch {
      setError("Cannot connect to server");
    }
  }

  async function loadSessions() {
    try {
      const res = await api.listSessions();
      if (res.success && res.data) {
        setSessions(res.data);
      }
    } catch {
      // 静默处理，不影响主页面
    }
  }

  function handleLiveToggle() {
    if (streaming) {
      unsubscribe();
    } else if (selectedSessionId) {
      subscribe(selectedSessionId);
    }
  }

  function formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  return (
    <div className="monitor-page">
      <div className="monitor-header">
        <h2>System Monitor</h2>
        <p className="monitor-subtitle">
          Real-time system status, health, and performance metrics.
        </p>
      </div>

      {error && <div className="monitor-error">{error}</div>}

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Status</div>
          <div className={`metric-value ${health?.status === "ok" ? "text-success" : "text-danger"}`}>
            {health?.status || "unknown"}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Version</div>
          <div className="metric-value">{health?.version || "-"}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Uptime</div>
          <div className="metric-value">
            {health ? formatUptime(health.uptime) : "-"}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">API Endpoint</div>
          <div className="metric-value metric-mono">
            {import.meta.env.VITE_API_BASE || "http://127.0.0.1:3000"}
          </div>
        </div>
      </div>

      <div className="monitor-section">
        <h3>Connection Log</h3>
        <div className="log-container">
          <div className="log-entry">
            <span className="log-time">{new Date().toLocaleTimeString()}</span>
            <span className={`log-level ${health ? "level-info" : "level-error"}`}>
              {health ? "INFO" : "ERROR"}
            </span>
            <span className="log-message">
              {health ? "Health check passed" : error || "Checking..."}
            </span>
          </div>
        </div>
      </div>

      <div className="monitor-section">
        <h3>Execution Tree</h3>
        <div className="tree-controls">
          <select
            className="tree-session-select"
            value={selectedSessionId}
            onChange={(e) => {
              unsubscribe();
              setSelectedSessionId(e.target.value);
            }}
          >
            <option value="">-- Select Session --</option>
            {sessions.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>
                {s.description} ({s.sessionId.slice(0, 8)})
              </option>
            ))}
          </select>
          <button
            className={`tree-live-btn ${streaming ? "tree-live-btn-active" : ""}`}
            onClick={handleLiveToggle}
            disabled={!selectedSessionId}
          >
            {streaming ? "Stop" : "Live"}
          </button>
          <button
            className="tree-refresh-btn"
            onClick={() => { loadSessions(); if (selectedSessionId) loadTree(selectedSessionId); }}
          >
            Refresh
          </button>
        </div>

        {treeError && <div className="monitor-error" style={{ marginTop: 8 }}>{treeError}</div>}

        {treeLoading && <div className="tree-placeholder">Loading...</div>}

        {!treeLoading && !tree && selectedSessionId && (
          <div className="tree-placeholder">No execution tree for this session</div>
        )}

        {!treeLoading && !selectedSessionId && (
          <div className="tree-placeholder">Select a session to view its execution tree</div>
        )}

        {tree && <ExecutionTreeView tree={tree} streaming={streaming} />}
      </div>
    </div>
  );
}
