/**
 * 执行树状态管理 Hook
 *
 * 支持快照加载和 SSE 实时订阅。
 */

import { useState, useRef, useCallback, useEffect } from "react";
import * as api from "../services/api";
import type { ExecutionTree } from "../services/api";

export function useExecutionTree() {
  const [tree, setTree] = useState<ExecutionTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  /** 加载执行树快照 */
  const loadTree = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getExecutionTree(sessionId);
      if (res.success) {
        setTree(res.data ?? null);
      } else {
        setError(res.error?.message || "加载执行树失败");
      }
    } catch {
      setError("无法连接到服务器");
    } finally {
      setLoading(false);
    }
  }, []);

  /** 开启 SSE 实时订阅 */
  const subscribe = useCallback((sessionId: string) => {
    unsubscribe();
    setStreaming(true);
    setError(null);

    const controller = api.streamExecutionTree(sessionId, {
      onTreeUpdate: (t) => setTree(t),
      onDone: () => setStreaming(false),
      onError: (msg) => {
        setError(msg);
        setStreaming(false);
      },
    });

    abortRef.current = controller;
  }, []);

  /** 取消 SSE 订阅 */
  const unsubscribe = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  // 组件卸载时自动清理
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { tree, loading, error, streaming, loadTree, subscribe, unsubscribe };
}
