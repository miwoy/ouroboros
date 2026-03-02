/**
 * Super Agent 执行器
 *
 * 根据协作模式编排多个 Agent 执行任务：
 * - sequential：按依赖拓扑排序串行执行
 * - parallel：无依赖 Agent 并行执行
 * - orchestrated：编排 Agent 动态决策
 */

import type {
  SuperAgentDefinition,
  SuperAgentTaskRequest,
  SuperAgentTaskResponse,
  RoleResult,
  AgentRole,
  SuperAgentExecutorDeps,
} from "./types.js";
import { buildSuperAgent, loadSuperAgent } from "./builder.js";
import { createSuperAgentRegistry } from "./registry.js";
import { createAgentExecutor } from "../solution/executor.js";

/** Super Agent 执行器接口 */
export interface SuperAgentExecutor {
  execute(request: SuperAgentTaskRequest): Promise<SuperAgentTaskResponse>;
}

/**
 * 创建 Super Agent 执行器
 */
export function createSuperAgentExecutor(deps: SuperAgentExecutorDeps): SuperAgentExecutor {
  return {
    async execute(request: SuperAgentTaskRequest): Promise<SuperAgentTaskResponse> {
      const startTime = Date.now();
      const { parentWorkspacePath, logger } = deps;

      // 1. 加载或创建 Super Agent
      const name = request.superAgentId.replace(/^super-agent:/, "");
      let instance = await loadSuperAgent(name, parentWorkspacePath);

      if (!instance) {
        const registry = await createSuperAgentRegistry(parentWorkspacePath);
        const definition = registry.get(request.superAgentId);
        if (!definition) {
          throw new Error(`Super Agent 不存在: ${request.superAgentId}`);
        }
        instance = await buildSuperAgent(definition, parentWorkspacePath);
      }

      logger.info("super-agent", "开始协作执行", {
        id: request.superAgentId,
        mode: instance.definition.collaboration.mode,
        roles: instance.definition.agents.length,
      });

      // 2. 根据协作模式执行
      let roleResults: readonly RoleResult[];

      switch (instance.definition.collaboration.mode) {
        case "sequential":
          roleResults = await executeSequential(instance.definition, request, deps);
          break;
        case "parallel":
          roleResults = await executeParallel(instance.definition, request, deps);
          break;
        case "orchestrated":
          roleResults = await executeOrchestrated(instance.definition, request, deps);
          break;
        default:
          throw new Error(`未知协作模式: ${instance.definition.collaboration.mode}`);
      }

      // 3. 汇总结果
      const allSuccess = roleResults.every((r) => r.success);
      const finalResult = roleResults
        .filter((r) => r.success)
        .map((r) => `## ${r.roleName}\n\n${r.output}`)
        .join("\n\n---\n\n");

      const duration = Date.now() - startTime;

      logger.info("super-agent", "协作执行完成", {
        duration,
        success: allSuccess,
        roles: roleResults.length,
      });

      // 4. 记录到短期记忆
      try {
        await instance.memoryManager.shortTerm.append({
          timestamp: new Date().toISOString(),
          type: "summary",
          content: `协作任务: ${request.task}\n模式: ${instance.definition.collaboration.mode}\n结果: ${allSuccess ? "成功" : "部分失败"}`,
        });
      } catch {
        // 记忆写入失败不影响执行
      }

      return {
        taskId: `super-task-${Date.now()}`,
        result: finalResult,
        roleResults,
        artifacts: roleResults.flatMap((r) => r.artifacts),
        duration,
        success: allSuccess,
        error: allSuccess ? undefined : "部分 Agent 执行失败",
      };
    },
  };
}

// ─── 协作模式实现 ──────────────────────────────────────────────

/** 串行执行：按依赖拓扑排序顺序执行 */
async function executeSequential(
  definition: SuperAgentDefinition,
  request: SuperAgentTaskRequest,
  deps: SuperAgentExecutorDeps,
): Promise<readonly RoleResult[]> {
  const sorted = topologicalSort(definition.agents);
  const results: RoleResult[] = [];
  let previousOutput = "";

  for (const role of sorted) {
    const context = buildRoleContext(request, role, previousOutput, results);
    const result = await executeRole(role, context, deps);
    results.push(result);

    if (result.success) {
      previousOutput = result.output;
    } else {
      // 串行模式下前置失败则后续 Agent 也标记失败
      for (const remaining of sorted.slice(sorted.indexOf(role) + 1)) {
        results.push({
          roleName: remaining.roleName,
          agentId: remaining.agentId,
          output: "",
          artifacts: [],
          duration: 0,
          success: false,
          error: `前置角色 "${role.roleName}" 执行失败`,
        });
      }
      break;
    }
  }

  return results;
}

/** 并行执行：无依赖 Agent 并行，有依赖的等待 */
async function executeParallel(
  definition: SuperAgentDefinition,
  request: SuperAgentTaskRequest,
  deps: SuperAgentExecutorDeps,
): Promise<readonly RoleResult[]> {
  const maxParallel = definition.collaboration.constraints?.maxParallelAgents ?? 5;
  const sorted = topologicalSort(definition.agents);
  const results = new Map<string, RoleResult>();
  const completed = new Set<string>();

  // 按层级分组（同一层无依赖可并行）
  const layers = buildLayers(sorted, definition.agents);

  for (const layer of layers) {
    const batch = layer.slice(0, maxParallel);
    const batchResults = await Promise.all(
      batch.map(async (role) => {
        const prevOutputs = (role.dependsOn ?? [])
          .map((dep) => results.get(dep)?.output ?? "")
          .filter(Boolean)
          .join("\n\n---\n\n");
        const context = buildRoleContext(request, role, prevOutputs, [...results.values()]);
        return executeRole(role, context, deps);
      }),
    );

    for (let i = 0; i < batch.length; i++) {
      const role = batch[i]!;
      results.set(role.roleName, batchResults[i]!);
      completed.add(role.roleName);
    }
  }

  return [...results.values()];
}

/** 编排执行：由编排 Agent 动态分配任务 */
async function executeOrchestrated(
  definition: SuperAgentDefinition,
  request: SuperAgentTaskRequest,
  deps: SuperAgentExecutorDeps,
): Promise<readonly RoleResult[]> {
  // 编排模式通过 orchestratorAgentId 指定的 Agent 来动态执行
  // 简化实现：将所有角色信息注入编排 Agent 的上下文，由它调用 run-agent
  const orchestratorId = definition.collaboration.orchestratorAgentId;
  if (!orchestratorId) {
    // 无编排 Agent，退回串行执行
    return executeSequential(definition, request, deps);
  }

  const rolesDescription = definition.agents
    .map((r) => `- ${r.roleName} (${r.agentId}): ${r.responsibility}`)
    .join("\n");

  const orchestratorContext = [
    `你是协作编排者。请根据以下任务调配 Agent 协作完成。`,
    `\n## 可用角色\n${rolesDescription}`,
    `\n## 任务\n${request.task}`,
    request.context ? `\n## 附加上下文\n${request.context}` : "",
  ].join("\n");

  const agentExecutor = createAgentExecutor(deps);
  const response = await agentExecutor.execute({
    agentId: orchestratorId,
    task: orchestratorContext,
  });

  return [
    {
      roleName: "orchestrator",
      agentId: orchestratorId,
      output: response.result,
      artifacts: [],
      duration: 0,
      success: response.task.state === "completed",
      error: response.task.state !== "completed" ? "编排执行失败" : undefined,
    },
  ];
}

// ─── 辅助函数 ──────────────────────────────────────────────────

/** 执行单个角色的 Agent */
async function executeRole(
  role: AgentRole,
  context: string,
  deps: SuperAgentExecutorDeps,
): Promise<RoleResult> {
  const startTime = Date.now();

  try {
    const agentExecutor = createAgentExecutor(deps);
    const response = await agentExecutor.execute({
      agentId: role.agentId,
      task: context,
    });

    return {
      roleName: role.roleName,
      agentId: role.agentId,
      output: response.result,
      artifacts: [],
      duration: Date.now() - startTime,
      success: response.task.state === "completed",
      error: response.task.state !== "completed" ? "Agent 执行失败" : undefined,
    };
  } catch (err) {
    return {
      roleName: role.roleName,
      agentId: role.agentId,
      output: "",
      artifacts: [],
      duration: Date.now() - startTime,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 构建角色执行上下文 */
function buildRoleContext(
  request: SuperAgentTaskRequest,
  role: AgentRole,
  previousOutput: string,
  // previousResults 预留给编排模式中的跨角色依赖引用
  _previousResults: readonly RoleResult[],
): string {
  const parts: string[] = [];

  parts.push(`## 任务\n${request.task}`);
  parts.push(`\n## 你的角色\n${role.roleName}: ${role.responsibility}`);

  if (previousOutput) {
    parts.push(`\n## 前置 Agent 的输出\n${previousOutput}`);
  }

  if (request.context) {
    parts.push(`\n## 附加上下文\n${request.context}`);
  }

  return parts.join("\n");
}

/** 拓扑排序 */
function topologicalSort(agents: readonly AgentRole[]): readonly AgentRole[] {
  const sorted: AgentRole[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const roleMap = new Map(agents.map((a) => [a.roleName, a]));

  function visit(role: AgentRole): void {
    if (visited.has(role.roleName)) return;
    if (visiting.has(role.roleName)) {
      throw new Error(`循环依赖: ${role.roleName}`);
    }

    visiting.add(role.roleName);
    for (const dep of role.dependsOn ?? []) {
      const depRole = roleMap.get(dep);
      if (depRole) visit(depRole);
    }
    visiting.delete(role.roleName);
    visited.add(role.roleName);
    sorted.push(role);
  }

  for (const agent of agents) {
    visit(agent);
  }

  return sorted;
}

/** 按依赖层级分组（同层可并行） */
function buildLayers(
  sorted: readonly AgentRole[],
  // all 参数预留给未来动态拓扑重建
  _all: readonly AgentRole[],
): readonly (readonly AgentRole[])[] {
  const layers: AgentRole[][] = [];
  const completed = new Set<string>();

  const remaining = [...sorted];
  while (remaining.length > 0) {
    const layer: AgentRole[] = [];
    const toRemove: number[] = [];

    for (let i = 0; i < remaining.length; i++) {
      const role = remaining[i]!;
      const deps = role.dependsOn ?? [];
      if (deps.every((d) => completed.has(d))) {
        layer.push(role);
        toRemove.push(i);
      }
    }

    if (layer.length === 0) break; // 防止死循环

    // 从后往前删除
    for (let i = toRemove.length - 1; i >= 0; i--) {
      remaining.splice(toRemove[i]!, 1);
    }

    for (const role of layer) {
      completed.add(role.roleName);
    }
    layers.push(layer);
  }

  return layers;
}
