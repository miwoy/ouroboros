/**
 * 对话视图 — 消息列表 + 输入框
 */

import { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { DisplayMessage } from "../hooks/useChat";
import "./ChatView.css";

interface ChatViewProps {
  readonly messages: readonly DisplayMessage[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onSend: (message: string) => void;
  readonly onStop: () => void;
}

export function ChatView({ messages, loading, error, onSend, onStop }: ChatViewProps) {
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
    if (e.key === "Enter" && !e.shiftKey) {
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
      </div>
    </div>
  );
}
