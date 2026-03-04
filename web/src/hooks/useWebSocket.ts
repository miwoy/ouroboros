/**
 * WebSocket 单例 Hook
 *
 * 全局共享一个 WsClient 实例，组件卸载时不关闭。
 */

import { useRef } from "react";
import { createWsClient, type WsClient } from "../services/ws";

/** 全局单例 */
let globalClient: WsClient | null = null;

function getClient(): WsClient {
  if (!globalClient) {
    globalClient = createWsClient();
  }
  return globalClient;
}

/**
 * 获取全局 WsClient 实例
 */
export function useWebSocket(): WsClient {
  const clientRef = useRef<WsClient>(getClient());
  return clientRef.current;
}
