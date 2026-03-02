/**
 * 身体图式实时数据 Hook
 *
 * 优先使用 WS body_schema 频道推送，不可用时 REST 兜底。
 */

import { useState, useEffect, useCallback } from "react";
import type { SelfSchemaData } from "../services/api";
import * as api from "../services/api";
import { useWebSocket } from "./useWebSocket";

/** REST 轮询间隔（WS 不可用时的兜底） */
const REST_POLL_INTERVAL = 10_000;

/**
 * 订阅身体图式实时更新
 */
export function useBodySchema(): SelfSchemaData | null {
  const [schema, setSchema] = useState<SelfSchemaData | null>(null);
  const ws = useWebSocket();

  // REST 兜底加载
  const loadFromRest = useCallback(async () => {
    try {
      const res = await api.getSelfSchema();
      if (res.success && res.data) {
        setSchema(res.data);
      }
    } catch {
      // 静默
    }
  }, []);

  useEffect(() => {
    // 初始加载
    loadFromRest();

    // WS 订阅
    ws.subscribe("body_schema");
    const unsubscribe = ws.onMessage((type, payload) => {
      if (type === "body_schema_update") {
        // payload 是 BodySchema 对象，需要包装为 SelfSchemaData 格式
        // 后端推送的是完整 body 对象，soul/hormones 不变
        setSchema((prev) => {
          if (!prev) return prev;
          return { ...prev, body: payload as SelfSchemaData["body"] };
        });
      }
    });

    // REST 兜底轮询（WS 断连时仍可更新）
    const timer = setInterval(() => {
      if (!ws.isConnected()) {
        loadFromRest();
      }
    }, REST_POLL_INTERVAL);

    return () => {
      unsubscribe();
      ws.unsubscribe("body_schema");
      clearInterval(timer);
    };
  }, [ws, loadFromRest]);

  return schema;
}
