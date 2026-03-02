/**
 * tool:run-agent — 内置 Agent 调用工具（Phase 3 Stub）
 *
 * ReAct 核心在阶段四实现，当前阶段返回结构化错误。
 */

import { ToolNotImplementedError } from "../../errors/index.js";
import type { ToolHandler } from "../types.js";

/** run-agent 工具处理函数（stub） */
export const handleRunAgent: ToolHandler = async () => {
  throw new ToolNotImplementedError(
    "tool:run-agent",
    "尚未实现（需要 ReAct 核心，阶段四开发）",
  );
};
