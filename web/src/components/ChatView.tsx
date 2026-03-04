/**
 * 对话视图 — 消息列表 + 输入框
 */

import { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { DisplayMessage, ToolCallDisplay } from "../hooks/useChat";
import { ExecutionTreeView } from "./ExecutionTreeView";
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
        </div>
        {showThought && (
          <div className="message-thought">
            {message.thought}
          </div>
        )}
        {hasToolCalls && (
          <div className="tool-calls-container">
            {message.toolCalls!.map((tc) => (
              <ToolCallCard key={tc.toolCallId} toolCall={tc} />
            ))}
          </div>
        )}
        {message.executionTree && (
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

function ToolCallCard({ toolCall }: { readonly toolCall: ToolCallDisplay }) {
  const [expanded, setExpanded] = useState(false);
  const isPending = toolCall.status === "pending";
  const isSuccess = toolCall.success === true;

  const statusIcon = isPending ? "\u23F3" : isSuccess ? "\u2705" : "\u274C";

  return (
    <div
      className={`tool-call-card ${isPending ? "tool-call-pending" : ""}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="tool-call-header">
        <span className="tool-call-name">{toolCall.toolName}</span>
        <span className="tool-call-status">{statusIcon}</span>
      </div>
      {expanded && (
        <div className="tool-call-details">
          <div className="tool-call-section">
            <strong>Input:</strong>
            <pre>{JSON.stringify(toolCall.input, null, 2)}</pre>
          </div>
          {toolCall.output && (
            <div className="tool-call-section">
              <strong>Output:</strong>
              <pre>{JSON.stringify(toolCall.output, null, 2)}</pre>
            </div>
          )}
          {toolCall.error && (
            <div className="tool-call-section tool-call-error-text">
              <strong>Error:</strong> {toolCall.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
