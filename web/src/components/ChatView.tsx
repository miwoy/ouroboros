/**
 * 对话视图 — 消息列表 + 输入框
 */

import { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { DisplayMessage, ToolCallDisplay } from "../hooks/useChat";
import { ExecutionTreeView } from "./ExecutionTreeView";
import { ProcessLogView } from "./ProcessLogView";
import "./ChatView.css";

interface ChatViewProps {
  readonly messages: readonly DisplayMessage[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onSend: (message: string) => void;
  readonly onStop: () => void;
  readonly tokenUsage?: { totalTokens: number; totalPromptTokens: number; totalCompletionTokens: number } | null;
}

export function ChatView({ messages, loading, error, onSend, onStop, tokenUsage }: ChatViewProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    onSend(input.trim());
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <div className="chat-view">
      <div className="messages-container">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <div className="welcome-icon">&#x1F40D;</div>
            <h2>Welcome to Ouroboros</h2>
            <p>Send a message to start a conversation with the Agent.</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {error && (
          <div className="chat-error">{error}</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {tokenUsage && tokenUsage.totalTokens > 0 && (
        <div className="chat-token-usage">
          Token: {tokenUsage.totalTokens.toLocaleString()} (prompt: {tokenUsage.totalPromptTokens.toLocaleString()}, completion: {tokenUsage.totalCompletionTokens.toLocaleString()})
        </div>
      )}

      <form className="chat-input-bar" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          rows={1}
          disabled={loading}
        />
        {loading ? (
          <button type="button" className="chat-stop-btn" onClick={onStop} title="Stop">
            &#9724;
          </button>
        ) : (
          <button
            type="submit"
            className="chat-send-btn"
            disabled={!input.trim()}
            title="Send"
          >
            &#x27A4;
          </button>
        )}
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === "user";
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;
  const showThought = message.thought && !message.content;
  const [treeExpanded, setTreeExpanded] = useState(false);
  const [activePanel, setActivePanel] = useState<"tree" | "log">("tree");

  const isStreaming = message.streaming === true;
  const hasProcessLogs = message.processLogs && message.processLogs.length > 0;
  const hasLiveTree = isStreaming && message.executionTree;
  const showExecutionPanels = isStreaming && (hasLiveTree || hasProcessLogs);

  return (
    <div className={`message ${isUser ? "message-user" : "message-agent"}`}>
      <div className="message-avatar">{isUser ? "U" : "A"}</div>
      <div className="message-content">
        <div className="message-header">
          <span className="message-role">{isUser ? "You" : "Agent"}</span>
          <span className="message-time">
            {new Date(message.timestamp).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {isStreaming && message.executionProgress && (
            <span className="execution-progress-badge">
              Steps: {message.executionProgress.stepCount} | Tools: {message.executionProgress.toolCallCount}
            </span>
          )}
        </div>
        {showThought && (
          <ThoughtBlock thought={message.thought!} streaming={isStreaming} />
        )}
        {hasToolCalls && (
          <div className="tool-calls-container">
            {message.toolCalls!.map((tc) => (
              <ToolCallCard key={tc.toolCallId} toolCall={tc} />
            ))}
          </div>
        )}
        {/* 流式执行面板 — Tab 切换 */}
        {showExecutionPanels && (
          <div className="execution-panels">
            <div className="panel-tabs">
              <button
                className={`panel-tab ${activePanel === "tree" ? "panel-tab-active" : ""}`}
                onClick={() => setActivePanel("tree")}
              >
                执行树
              </button>
              <button
                className={`panel-tab ${activePanel === "log" ? "panel-tab-active" : ""}`}
                onClick={() => setActivePanel("log")}
              >
                过程日志 {hasProcessLogs ? `(${message.processLogs!.length})` : ""}
              </button>
            </div>
            <div className="panel-body">
              {activePanel === "tree" && message.executionTree && (
                <ExecutionTreeView tree={message.executionTree} streaming={true} />
              )}
              {activePanel === "log" && hasProcessLogs && (
                <ProcessLogView logs={message.processLogs!} />
              )}
            </div>
          </div>
        )}
        {/* 完成后的执行树 — 可折叠 */}
        {!isStreaming && message.executionTree && (
          <div className="execution-tree-inline">
            <button
              className="tree-toggle-btn"
              onClick={() => setTreeExpanded(!treeExpanded)}
            >
              {treeExpanded ? "\u25BC" : "\u25B6"} 执行树
            </button>
            {treeExpanded && (
              <div className="tree-inline-body">
                <ExecutionTreeView tree={message.executionTree} />
              </div>
            )}
          </div>
        )}
        <div className="markdown-body">
          {message.content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {message.content}
            </ReactMarkdown>
          ) : message.streaming ? (
            <span className="typing-indicator">
              <span />
              <span />
              <span />
            </span>
          ) : null}
        </div>
        {!isUser && message.metadata?.totalUsage != null && (
          <div className="message-token-usage">
            {String((message.metadata.totalUsage as { totalTokens: number }).totalTokens.toLocaleString())} tokens
          </div>
        )}
      </div>
    </div>
  );
}

function ThoughtBlock({ thought, streaming }: { readonly thought: string; readonly streaming?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = thought.length > 200;
  const displayText = isLong && !expanded ? thought.slice(0, 200) + "…" : thought;

  return (
    <div className={`message-thought ${streaming ? "thought-streaming" : ""}`}>
      <div className="thought-header">
        <span className="thought-icon">&#x1F4AD;</span>
        <span className="thought-label">思考过程</span>
        {streaming && <span className="thought-live">思考中...</span>}
      </div>
      <div className="thought-text">{displayText}</div>
      {isLong && (
        <button className="thought-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded ? "收起" : "展开全部"}
        </button>
      )}
    </div>
  );
}

function ToolCallCard({ toolCall }: { readonly toolCall: ToolCallDisplay }) {
  const [expanded, setExpanded] = useState(false);
  const isPending = toolCall.status === "pending";
  const isSuccess = toolCall.success === true;
  const isFailed = toolCall.success === false;

  const statusIcon = isPending ? "\u23F3" : isSuccess ? "\u2713" : "\u2717";
  const statusClass = isPending ? "tc-pending" : isSuccess ? "tc-success" : "tc-failed";

  // 简化输出预览
  const outputPreview = toolCall.output
    ? JSON.stringify(toolCall.output).slice(0, 100)
    : toolCall.error
      ? toolCall.error.slice(0, 100)
      : null;

  return (
    <div
      className={`tool-call-card ${isPending ? "tool-call-pending" : ""} ${isFailed ? "tool-call-failed" : ""}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="tool-call-header">
        <span className="tool-call-type-icon">T</span>
        <span className="tool-call-name">{toolCall.toolName}</span>
        {!isPending && outputPreview && !expanded && (
          <span className="tool-call-preview">{outputPreview}{outputPreview.length >= 100 ? "…" : ""}</span>
        )}
        <span className={`tool-call-status ${statusClass}`}>{statusIcon}</span>
      </div>
      {expanded && (
        <div className="tool-call-details">
          <div className="tool-call-section">
            <span className="tool-detail-label">Input</span>
            <pre>{JSON.stringify(toolCall.input, null, 2)}</pre>
          </div>
          {toolCall.output && (
            <div className="tool-call-section">
              <span className="tool-detail-label">Output</span>
              <pre>{JSON.stringify(toolCall.output, null, 2)}</pre>
            </div>
          )}
          {toolCall.error && (
            <div className="tool-call-section tool-call-error-text">
              <span className="tool-detail-label">Error</span>
              <pre>{toolCall.error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
