/**
 * WebSocket 类型定义
 *
 * 定义 WS 信封格式、消息类型、频道等。
 */

/** 服务端→客户端消息类型 */
export type WsServerMessageType =
  | "body_schema_update"
  | "react_step"
  | "tool_call"
  | "tool_result"
  | "tree_update"
  | "text_delta"
  | "done"
  | "error"
  | "pong";

/** 客户端→服务端消息类型 */
export type WsClientMessageType = "subscribe" | "unsubscribe" | "ping";

/** WS 消息类型联合 */
export type WsMessageType = WsServerMessageType | WsClientMessageType;

/** 订阅频道 */
export type WsChannel = "body_schema" | "session";

/** WS 消息信封 */
export interface WsEnvelope {
  readonly type: WsMessageType;
  readonly payload: unknown;
  readonly requestId?: string;
}

/** 客户端订阅消息 */
export interface WsSubscribePayload {
  readonly channel: WsChannel;
  readonly sessionId?: string;
}

/** 客户端连接元数据 */
export interface WsClientMeta {
  readonly subscriptions: Set<WsChannel>;
  sessionId?: string;
}
