/**
 * Super Agent 注册表
 *
 * 管理 SuperAgentDefinition 的注册、查询、持久化。
 * 结构与 Solution 注册表一致。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { EntityStatus } from "../tool/types.js";
import type {
  SuperAgentDefinition,
  SuperAgentRegistry,
  SuperAgentRegistryData,
} from "./types.js";

/**
 * 创建 Super Agent 注册表
 */
export async function createSuperAgentRegistry(
  workspacePath: string,
): Promise<SuperAgentRegistry> {
  const registryPath = join(workspacePath, "super-agents", "registry.json");
  const superAgents = new Map<string, SuperAgentDefinition>();

  // 加载已有数据
  const existing = await loadRegistryFile(registryPath);
  for (const sa of existing) {
    superAgents.set(sa.id, sa);
  }

  return {
    get(id: string): SuperAgentDefinition | undefined {
      return superAgents.get(id);
    },

    has(id: string): boolean {
      return superAgents.has(id);
    },

    list(): readonly SuperAgentDefinition[] {
      return [...superAgents.values()];
    },

    listByOrigin(origin: "system" | "user" | "generated"): readonly SuperAgentDefinition[] {
      return [...superAgents.values()].filter((s) => s.origin === origin);
    },

    async register(definition: SuperAgentDefinition): Promise<void> {
      superAgents.set(definition.id, definition);
      await saveRegistryFile(registryPath, [...superAgents.values()]);
    },

    async updateStatus(
      id: string,
      status: EntityStatus,
    ): Promise<SuperAgentDefinition> {
      const existing = superAgents.get(id);
      if (!existing) {
        throw new Error(`Super Agent 不存在: ${id}`);
      }
      const updated: SuperAgentDefinition = {
        ...existing,
        status,
        updatedAt: new Date().toISOString(),
      };
      superAgents.set(id, updated);
      await saveRegistryFile(registryPath, [...superAgents.values()]);
      return updated;
    },
  };
}

// ─── 内部函数 ──────────────────────────────────────────────────

async function loadRegistryFile(
  filePath: string,
): Promise<readonly SuperAgentDefinition[]> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw) as SuperAgentRegistryData;
    return data.superAgents ?? [];
  } catch {
    return [];
  }
}

async function saveRegistryFile(
  filePath: string,
  superAgents: readonly SuperAgentDefinition[],
): Promise<void> {
  const data: SuperAgentRegistryData = {
    version: "1.0.0",
    updatedAt: new Date().toISOString(),
    superAgents,
  };
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
