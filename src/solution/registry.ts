/**
 * Solution 注册表
 *
 * 管理 SolutionDefinition 的注册、查询、持久化。
 * - 内存 Map 存储
 * - 持久化到 workspace/solutions/registry.json
 * - 追加到 workspace/prompts/agent.md
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { EntityStatus } from "../tool/types.js";
import type {
  SolutionDefinition,
  SolutionRegistry,
  SolutionRegistryData,
} from "./types.js";
import { appendToPromptFile } from "../prompt/store.js";

/**
 * 创建 Solution 注册表
 *
 * @param workspacePath - workspace 根目录
 */
export async function createSolutionRegistry(
  workspacePath: string,
): Promise<SolutionRegistry> {
  const registryPath = join(workspacePath, "solutions", "registry.json");
  const agentMdPath = join(workspacePath, "prompts", "agent.md");

  // 加载已有注册数据
  const solutions = new Map<string, SolutionDefinition>();
  const existing = await loadRegistryFile(registryPath);
  for (const s of existing) {
    solutions.set(s.id, s);
  }

  return {
    get(solutionId: string): SolutionDefinition | undefined {
      return solutions.get(solutionId);
    },

    has(solutionId: string): boolean {
      return solutions.has(solutionId);
    },

    list(): readonly SolutionDefinition[] {
      return [...solutions.values()];
    },

    listByOrigin(origin: "system" | "user" | "generated"): readonly SolutionDefinition[] {
      return [...solutions.values()].filter((s) => s.origin === origin);
    },

    async register(solution: SolutionDefinition): Promise<void> {
      solutions.set(solution.id, solution);
      await saveRegistryFile(registryPath, [...solutions.values()]);
      await appendAgentEntry(agentMdPath, solution);
    },

    async updateStatus(
      solutionId: string,
      status: EntityStatus,
    ): Promise<SolutionDefinition> {
      const existing = solutions.get(solutionId);
      if (!existing) {
        throw new Error(`Solution 不存在: ${solutionId}`);
      }
      const updated: SolutionDefinition = {
        ...existing,
        status,
        updatedAt: new Date().toISOString(),
      };
      solutions.set(solutionId, updated);
      await saveRegistryFile(registryPath, [...solutions.values()]);
      return updated;
    },
  };
}

// ─── 内部函数 ──────────────────────────────────────────────────

/** 加载注册表文件 */
async function loadRegistryFile(
  filePath: string,
): Promise<readonly SolutionDefinition[]> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw) as SolutionRegistryData;
    return data.solutions ?? [];
  } catch {
    return [];
  }
}

/** 保存注册表文件 */
async function saveRegistryFile(
  filePath: string,
  solutions: readonly SolutionDefinition[],
): Promise<void> {
  const data: SolutionRegistryData = {
    version: "1.0.0",
    updatedAt: new Date().toISOString(),
    solutions,
  };
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/** 追加 Agent 条目到 agent.md */
async function appendAgentEntry(
  agentMdPath: string,
  solution: SolutionDefinition,
): Promise<void> {
  const entry = `| ${solution.name} | ${solution.id} | ${solution.description} | ${solution.workspacePath} |`;
  try {
    await appendToPromptFile(agentMdPath, entry);
  } catch {
    // agent.md 不存在时忽略
  }
}
