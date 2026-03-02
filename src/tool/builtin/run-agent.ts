/**
 * tool:run-agent — 内置 Agent 调用工具（Stub）
 *
 * 需要 Agent（Solution）系统，阶段八开发。
 * ReAct 核心循环已在阶段四实现，但完整 Agent 生命周期管理在阶段八。
 */

import { ToolNotImplementedError } from "../../errors/index.js";
import type { ToolHandler } from "../types.js";

/** run-agent 工具处理函数（stub） */
export const handleRunAgent: ToolHandler = async () => {
  throw new ToolNotImplementedError(
    "tool:run-agent",
    "尚未实现（需要 Agent（Solution）系统，阶段八开发）",
  );
};
