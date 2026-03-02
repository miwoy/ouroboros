/**
 * Agent 执行器
 *
 * 封装 Agent 任务执行的完整流程：
 * 1. 加载或创建 Agent 实例
 * 2. 构建系统提示词（身份 + 知识库 + 技能描述）
 * 3. 筛选可用工具
 * 4. 运行 ReAct 循环
 * 5. 收集结果
 */

import type {
  Agent,
  SendTaskRequest,
  SendTaskResponse,
  AgentTask,
  AgentExecutorDeps,
} from "./types.js";
import type { OuroborosTool } from "../tool/types.js";
import { runReactLoop } from "../core/loop.js";
import { loadAgent, buildAgent } from "./builder.js";
import { createSolutionRegistry } from "./registry.js";

/** Agent 执行器接口 */
export interface AgentExecutor {
  /** 执行 Agent 任务 */
  execute(request: SendTaskRequest): Promise<SendTaskResponse>;
}

/**
 * 创建 Agent 执行器
 *
 * @param deps - 依赖注入
 */
export function createAgentExecutor(deps: AgentExecutorDeps): AgentExecutor {
  return {
    async execute(request: SendTaskRequest): Promise<SendTaskResponse> {
      const { callModel, toolRegistry, toolExecutor, logger, workspacePath } = deps;

      // 1. 加载 Agent
      const agentName = request.agentId.replace(/^solution:/, "");
      let agent = await loadAgent(agentName, workspacePath);

      if (!agent) {
        // 尝试从注册表加载 definition 并构建
        const registry = await createSolutionRegistry(workspacePath);
        const definition = registry.get(request.agentId);
        if (!definition) {
          throw new Error(`Agent 不存在: ${request.agentId}`);
        }
        agent = await buildAgent(definition, workspacePath);
      }

      // 2. 构建 Agent 上下文提示词
      const contextPrompt = await buildAgentContextPrompt(agent);

      // 3. 筛选可用工具
      const availableTools = filterAgentTools(agent, toolRegistry.list());

      // 4. 运行 ReAct 循环
      const reactResult = await runReactLoop(
        buildTaskPrompt(request),
        contextPrompt,
        availableTools,
        {
          maxIterations: agent.definition.interaction.maxTurns ?? 20,
          stepTimeout: 60000,
          parallelToolCalls: true,
          compressionThreshold: 10,
          agentId: agent.id,
        },
        {
          callModel,
          toolExecutor,
          toolRegistry,
          logger,
          workspacePath: agent.workspacePath,
        },
      );

      // 5. 记录到短期记忆
      if (agent.definition.memory?.shortTerm !== false) {
        try {
          await agent.memoryManager.shortTerm.append({
            timestamp: new Date().toISOString(),
            type: "conversation",
            content: `任务: ${request.task}\n结果: ${reactResult.answer.slice(0, 500)}`,
          });
        } catch {
          // 记忆写入失败不影响执行
        }
      }

      // 6. 构建任务记录
      const now = new Date().toISOString();
      const task: AgentTask = {
        id: `task-${Date.now()}`,
        agentId: request.agentId,
        parentTaskId: request.parentTaskId,
        state: reactResult.stopReason === "completed" ? "completed" : "failed",
        description: request.task,
        messages: [
          {
            id: "msg-user",
            role: "user",
            parts: [{ type: "text", text: request.task }],
            timestamp: now,
          },
          {
            id: "msg-agent",
            role: "agent",
            parts: [{ type: "text", text: reactResult.answer }],
            timestamp: now,
          },
        ],
        artifacts: [],
        createdAt: now,
        updatedAt: now,
        stateHistory: [
          {
            from: "submitted",
            to: reactResult.stopReason === "completed" ? "completed" : "failed",
            reason: reactResult.stopReason,
            timestamp: now,
            triggeredBy: "agent",
          },
        ],
      };

      return {
        task,
        result: reactResult.answer,
        executionTree: reactResult.executionTree,
      };
    },
  };
}

// ─── 内部函数 ──────────────────────────────────────────────────

/** 构建 Agent 上下文提示词（身份 + 知识库） */
async function buildAgentContextPrompt(agent: Agent): Promise<string> {
  const parts: string[] = [];

  // 身份提示词
  parts.push("## 身份定义\n");
  parts.push(agent.definition.identityPrompt);

  // 知识库
  const knowledge = await agent.knowledgeBase.loadAll();
  if (knowledge) {
    parts.push("\n\n## 知识库\n");
    parts.push(knowledge);
  }

  // 可用技能列表
  if (agent.definition.skills.length > 0) {
    parts.push("\n\n## 可用技能\n");
    parts.push(agent.definition.skills.map((s) => `- ${s}`).join("\n"));
  }

  return parts.join("\n");
}

/** 筛选 Agent 可用的工具 */
function filterAgentTools(
  agent: Agent,
  allTools: readonly OuroborosTool[],
): readonly OuroborosTool[] {
  // Agent 默认可使用所有一级和二级工具
  // additionalTools 用于授权额外自定义工具
  const additional = new Set(agent.definition.additionalTools ?? []);

  return allTools.filter((tool) => {
    // 内置工具始终可用
    if (tool.entrypoint.startsWith("builtin:")) return true;
    // 额外授权的工具
    if (additional.has(tool.id)) return true;
    return false;
  });
}

/** 构建任务提示词 */
function buildTaskPrompt(request: SendTaskRequest): string {
  const parts: string[] = [request.task];

  if (request.context) {
    parts.push(`\n\n## 附加上下文\n${request.context}`);
  }

  return parts.join("");
}
