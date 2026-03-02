/**
 * tool:run-agent — Agent 调用工具
 *
 * 加载指定 Agent 并执行任务，通过 ReAct 循环完成。
 * 使用动态导入避免与 tool/executor.ts 的循环依赖。
 */

import type { ToolHandler } from "../types.js";
import { createLogger } from "../../logger/logger.js";

/** run-agent 工具处理函数 */
export const handleRunAgent: ToolHandler = async (input, context) => {
  const agentId = input["agentId"] as string;
  const task = input["task"] as string;
  const taskContext = input["context"] as string | undefined;

  // 动态导入避免循环依赖（tool/executor → run-agent → tool/executor）
  const [{ createAgentExecutor }, { createToolExecutor }] = await Promise.all([
    import("../../solution/executor.js"),
    import("../executor.js"),
  ]);

  // 创建 Agent 专用的工具执行器
  const toolExecutor = createToolExecutor(context.registry, {
    workspacePath: context.workspacePath,
    callModel: context.callModel,
  });

  // 创建 Agent 执行器
  const executor = createAgentExecutor({
    callModel: context.callModel,
    toolRegistry: context.registry,
    toolExecutor,
    skillRegistry: await loadSkillRegistry(context.workspacePath),
    logger: createLogger(context.workspacePath),
    workspacePath: context.workspacePath,
  });

  const response = await executor.execute({
    agentId,
    task,
    context: taskContext,
    parentTaskId: context.caller.nodeId,
  });

  return {
    result: response.result,
    taskId: response.task.id,
    agentId,
    state: response.task.state,
  };
};

/** 延迟导入 SkillRegistry */
async function loadSkillRegistry(workspacePath: string) {
  const { createSkillRegistry } = await import("../../skill/registry.js");
  return createSkillRegistry(workspacePath);
}
