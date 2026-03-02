/**
 * Ouroboros Web UI 主应用
 */

import { useState, useEffect, useCallback } from "react";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { AgentsPage } from "./pages/AgentsPage";
import { MonitorPage } from "./pages/MonitorPage";
import { useChat } from "./hooks/useChat";
import * as api from "./services/api";

export default function App() {
  const [currentView, setCurrentView] = useState("chat");
  const [connected, setConnected] = useState(false);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const chat = useChat();

  // 健康检查
  useEffect(() => {
    async function check() {
      try {
        const res = await api.getHealth();
        setConnected(res.success === true);
      } catch {
        setConnected(false);
      }
    }
    check();
    const timer = setInterval(check, 10000);
    return () => clearInterval(timer);
  }, []);

  const handleNewChat = useCallback(() => {
    chat.clearChat();
    setCurrentView("chat");
  }, [chat]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      chat.loadSession(sessionId);
      setCurrentView("chat");
    },
    [chat],
  );

  // 消息发送后刷新侧边栏
  const handleSend = useCallback(
    (message: string) => {
      chat.sendMessage(message);
      setTimeout(() => setSidebarRefreshKey((k) => k + 1), 1000);
    },
    [chat],
  );

  return (
    <>
      <Header
        currentView={currentView}
        onViewChange={setCurrentView}
        onNewChat={handleNewChat}
        connected={connected}
      />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {currentView === "chat" && (
          <Sidebar
            activeSessionId={chat.sessionId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            refreshKey={sidebarRefreshKey}
          />
        )}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {currentView === "chat" && (
            <ChatView
              messages={chat.messages}
              loading={chat.loading}
              error={chat.error}
              onSend={handleSend}
              onStop={chat.stopGeneration}
              tokenUsage={chat.tokenUsage}
            />
          )}
          {currentView === "agents" && <AgentsPage />}
          {currentView === "monitor" && <MonitorPage />}
        </main>
      </div>
    </>
  );
}
