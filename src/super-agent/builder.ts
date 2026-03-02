/**
 * Super Agent 构建器
 *
 * 创建 Super Agent 工作空间和实例。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { initWorkspace } from "../workspace/init.js";
import { createMemoryManager } from "../memory/manager.js";
import type { SuperAgentDefinition, SuperAgentInstance } from "./types.js";

/** Super Agent 元数据 */
interface SuperAgentMetadata {
  readonly superAgentId: string;
  readonly name: string;
  readonly version: string;
  readonly roles: readonly string[];
  readonly collaborationMode: string;
  readonly createdAt: string;
}

/**
 * 构建 Super Agent 实例
 *
 * @param definition - Super Agent 定义
 * @param parentWorkspacePath - 父级 workspace 路径
 */
export async function buildSuperAgent(
  definition: SuperAgentDefinition,
  parentWorkspacePath: string,
): Promise<SuperAgentInstance> {
  const name = extractName(definition.id);
  const superAgentDir = join(parentWorkspacePath, "super-agents", name);
  const workspacePath = join(superAgentDir, "workspace");

  // 1. 创建目录
  await mkdir(superAgentDir, { recursive: true });

  // 2. 写入 config.json
  await writeFile(
    join(superAgentDir, "config.json"),
    JSON.stringify(definition, null, 2),
    "utf-8",
  );

  // 3. 写入 metadata.json
  const now = new Date().toISOString();
  const metadata: SuperAgentMetadata = {
    superAgentId: definition.id,
    name,
    version: definition.version,
    roles: definition.agents.map((a) => a.roleName),
    collaborationMode: definition.collaboration.mode,
    createdAt: now,
  };
  await writeFile(
    join(superAgentDir, "metadata.json"),
    JSON.stringify(metadata, null, 2),
    "utf-8",
  );

  // 4. 初始化工作空间
  await initWorkspace(workspacePath);

  // 5. 创建结果目录
  await mkdir(join(workspacePath, "results"), { recursive: true });

  const memoryManager = createMemoryManager(workspacePath);

  return {
    id: definition.id,
    name,
    definition,
    workspacePath,
    memoryManager,
    createdAt: now,
  };
}

/**
 * 加载已有 Super Agent 实例
 */
export async function loadSuperAgent(
  superAgentName: string,
  parentWorkspacePath: string,
): Promise<SuperAgentInstance | null> {
  const superAgentDir = join(parentWorkspacePath, "super-agents", superAgentName);
  const configPath = join(superAgentDir, "config.json");

  try {
    const raw = await readFile(configPath, "utf-8");
    const definition = JSON.parse(raw) as SuperAgentDefinition;
    const workspacePath = join(superAgentDir, "workspace");

    let createdAt = new Date().toISOString();
    try {
      const metaRaw = await readFile(join(superAgentDir, "metadata.json"), "utf-8");
      const meta = JSON.parse(metaRaw) as SuperAgentMetadata;
      createdAt = meta.createdAt;
    } catch {
      // 忽略
    }

    const memoryManager = createMemoryManager(workspacePath);

    return {
      id: definition.id,
      name: superAgentName,
      definition,
      workspacePath,
      memoryManager,
      createdAt,
    };
  } catch {
    return null;
  }
}

/** 从 ID 提取名称 */
function extractName(id: string): string {
  return id.replace(/^super-agent:/, "");
}
