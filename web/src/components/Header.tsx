/**
 * 顶部导航栏
 */

import { useState } from "react";
import "./Header.css";

interface HeaderProps {
  readonly currentView: string;
  readonly onViewChange: (view: string) => void;
  readonly onNewChat: () => void;
  readonly connected: boolean;
}

export function Header({ currentView, onViewChange, onNewChat, connected }: HeaderProps) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <header className="header">
      <div className="header-left">
        <h1 className="header-logo">Ouroboros</h1>
        <nav className="header-nav">
          <button
            className={`nav-btn ${currentView === "chat" ? "active" : ""}`}
            onClick={() => onViewChange("chat")}
          >
            Chat
          </button>
          <button
            className={`nav-btn ${currentView === "agents" ? "active" : ""}`}
            onClick={() => onViewChange("agents")}
          >
            Agents
          </button>
          <button
            className={`nav-btn ${currentView === "monitor" ? "active" : ""}`}
            onClick={() => onViewChange("monitor")}
          >
            Monitor
          </button>
        </nav>
      </div>
      <div className="header-right">
        <span className={`status-dot ${connected ? "connected" : "disconnected"}`} />
        <span className="status-text">{connected ? "已连接" : "未连接"}</span>
        <button className="nav-btn" onClick={onNewChat} title="新对话">
          +
        </button>
        <button
          className="nav-btn settings-btn"
          onClick={() => setShowSettings(!showSettings)}
          title="设置"
        >
          &#9881;
        </button>
      </div>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </header>
  );
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState(localStorage.getItem("ouroboros_api_key") || "");

  function handleSave() {
    if (apiKey) {
      localStorage.setItem("ouroboros_api_key", apiKey);
    } else {
      localStorage.removeItem("ouroboros_api_key");
    }
    onClose();
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Settings</h3>
        <label>
          API Key
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="留空则无认证"
          />
        </label>
        <div className="settings-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
