/**
 * WebSocket 客户端
 *
 * 自动重连、JSON 信封解析、频道订阅。
 */

/** WS 信封格式（与后端一致） */
export interface WsEnvelope {
  readonly type: string;
  readonly payload: unknown;
}

/** WS 消息回调 */
export type WsMessageHandler = (type: string, payload: unknown) => void;

/** WS 客户端接口 */
export interface WsClient {
  subscribe(channel: string, sessionId?: string): void;
  unsubscribe(channel: string): void;
  onMessage(handler: WsMessageHandler): () => void;
  isConnected(): boolean;
  close(): void;
}

/** 重连参数 */
const MIN_RECONNECT_DELAY = 1_000;
const MAX_RECONNECT_DELAY = 30_000;

/**
 * 创建 WS 客户端
 */
export function createWsClient(baseUrl?: string): WsClient {
  const wsBase = baseUrl || import.meta.env.VITE_API_BASE || window.location.origin;
  const wsUrl = wsBase.replace(/^http/, "ws") + "/ws";

  let ws: WebSocket | null = null;
  let reconnectDelay = MIN_RECONNECT_DELAY;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const handlers = new Set<WsMessageHandler>();
  const activeSubscriptions = new Map<string, string | undefined>(); // channel → sessionId

  function connect(): void {
    if (closed) return;

    // 附加 API key（如有）
    const apiKey = localStorage.getItem("ouroboros_api_key");
    const url = apiKey ? `${wsUrl}?token=${encodeURIComponent(apiKey)}` : wsUrl;

    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      reconnectDelay = MIN_RECONNECT_DELAY;
      // 重新订阅所有活跃频道
      for (const [channel, sessionId] of activeSubscriptions) {
        sendSubscribe(channel, sessionId);
      }
    };

    ws.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data as string) as WsEnvelope;
        for (const handler of handlers) {
          handler(envelope.type, envelope.payload);
        }
      } catch {
        // JSON 解析失败，忽略
      }
    };

    ws.onclose = () => {
      ws = null;
      if (!closed) scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose 会在 onerror 之后触发
    };
  }

  function scheduleReconnect(): void {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
      connect();
    }, reconnectDelay);
  }

  function send(envelope: WsEnvelope): void {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(envelope));
    }
  }

  function sendSubscribe(channel: string, sessionId?: string): void {
    send({ type: "subscribe", payload: { channel, sessionId } });
  }

  function subscribe(channel: string, sessionId?: string): void {
    activeSubscriptions.set(channel, sessionId);
    sendSubscribe(channel, sessionId);
  }

  function unsubscribe(channel: string): void {
    activeSubscriptions.delete(channel);
    send({ type: "unsubscribe", payload: { channel } });
  }

  function onMessage(handler: WsMessageHandler): () => void {
    handlers.add(handler);
    return () => handlers.delete(handler);
  }

  function isConnected(): boolean {
    return ws?.readyState === WebSocket.OPEN;
  }

  function close(): void {
    closed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    ws?.close();
    ws = null;
    handlers.clear();
    activeSubscriptions.clear();
  }

  // 自动连接
  connect();

  return { subscribe, unsubscribe, onMessage, isConnected, close };
}
