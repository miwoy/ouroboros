/**
 * 工具注册表
 *
 * 管理工具的注册、查找、持久化。
 * - 内存 Map 提供快速查找
 * - 自定义工具持久化到 workspace/tools/registry.json
 * - 注册时追加 tool.md 条目 + 更新 qmd 索引
 * - 内置工具（origin: 'system'）不持久化到 registry.json
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { appendToPromptFile, getPromptFilePath } from "../prompt/store.js";
import { isQmdAvailable, updateVectorIndex } from "../prompt/vector.js";
import {
  EntityStatus,
  type OuroborosTool,
  type ToolRegistry,
  type ToolRegistryData,
} from "./types.js";
import { getBuiltinToolDefinitions } from "./builtin/definitions.js";
import { getSecondaryToolDefinitions } from "./builtin/secondary-definitions.js";

/**
 * 创建工具注册表
 *
 * 初始化时：
 * 1. 注册 4 个内置工具到内存
 * 2. 从 workspace/tools/registry.json 加载已持久化的自定义工具
 *
 * @param workspacePath - workspace 根目录
 * @returns 工具注册表实例
 */
export async function createToolRegistry(workspacePath: string): Promise<ToolRegistry> {
  const tools = new Map<string, OuroborosTool>();

  // 注册一级内置工具
  for (const tool of getBuiltinToolDefinitions()) {
    tools.set(tool.id, tool);
  }

  // 注册二级内置工具
  for (const tool of getSecondaryToolDefinitions()) {
    tools.set(tool.id, tool);
  }

  // 加载已持久化的自定义工具
  const registryData = await loadRegistryFile(workspacePath);
  for (const tool of registryData.tools) {
    tools.set(tool.id, tool);
  }

  const registry: ToolRegistry = {
    get(toolId: string): OuroborosTool | undefined {
      return tools.get(toolId);
    },

    has(toolId: string): boolean {
      return tools.has(toolId);
    },

    list(): readonly OuroborosTool[] {
      return [...tools.values()];
    },

    listCustom(): readonly OuroborosTool[] {
      return [...tools.values()].filter((t) => t.origin !== "system");
    },

    async register(tool: OuroborosTool): Promise<void> {
      tools.set(tool.id, tool);

      // 内置工具不持久化
      if (tool.origin === "system") return;

      // 持久化到 registry.json
      await saveRegistryFile(workspacePath, registry.listCustom());

      // 追加 tool.md 条目
      const toolMdEntry = `| ${tool.name} | ${tool.id} | ${tool.description} | ${tool.entrypoint} |`;
      const toolMdPath = getPromptFilePath(workspacePath, "tool");
      try {
        await appendToPromptFile(toolMdPath, toolMdEntry);
      } catch {
        // tool.md 不存在时忽略（workspace 未完全初始化）
      }

      // 更新 qmd 索引
      const qmdReady = await isQmdAvailable(workspacePath);
      if (qmdReady) {
        try {
          await updateVectorIndex(workspacePath);
        } catch {
          // qmd 更新失败不影响注册
        }
      }
    },

    async updateStatus(toolId: string, status: EntityStatus): Promise<OuroborosTool> {
      const existing = tools.get(toolId);
      if (!existing) {
        throw new Error(`工具 "${toolId}" 不存在`);
      }

      const updated: OuroborosTool = {
        ...existing,
        status,
        updatedAt: new Date().toISOString(),
      };
      tools.set(toolId, updated);

      // 内置工具不持久化
      if (updated.origin !== "system") {
        await saveRegistryFile(workspacePath, registry.listCustom());
      }

      return updated;
    },
  };

  return registry;
}

// ─── 内部工具函数 ──────────────────────────────────────────────────

/** 注册表文件路径 */
function getRegistryPath(workspacePath: string): string {
  return join(workspacePath, "tools", "registry.json");
}

/** 加载注册表文件 */
async function loadRegistryFile(workspacePath: string): Promise<ToolRegistryData> {
  const filePath = getRegistryPath(workspacePath);
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as ToolRegistryData;
  } catch {
    return { version: "1.0.0", updatedAt: new Date().toISOString(), tools: [] };
  }
}

/** 保存注册表文件 */
async function saveRegistryFile(
  workspacePath: string,
  customTools: readonly OuroborosTool[],
): Promise<void> {
  const filePath = getRegistryPath(workspacePath);
  const data: ToolRegistryData = {
    version: "1.0.0",
    updatedAt: new Date().toISOString(),
    tools: customTools,
  };
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
