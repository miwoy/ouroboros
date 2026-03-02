/**
 * Agent 构建器
 *
 * 创建 Agent 工作空间目录结构、配置文件、元数据。
 * 加载已有 Agent 实例。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { initWorkspace } from "../workspace/init.js";
import { createMemoryManager } from "../memory/manager.js";
import { createKnowledgeBase } from "./knowledge.js";
import type {
  SolutionDefinition,
  Agent,
  AgentSystemConfig,
} from "./types.js";

/** Agent 元数据（持久化到 metadata.json） */
interface AgentMetadata {
  readonly agentId: string;
  readonly name: string;
  readonly solutionId: string;
  readonly version: string;
  readonly createdAt: string;
  readonly createdBy: string;
}

/**
 * 创建 Agent 实例
 *
 * 1. 创建 workspace/agents/{name}/ 目录结构
 * 2. 写入 config.json（SolutionDefinition）
 * 3. 写入 metadata.json
 * 4. 初始化 Agent 工作空间
 *
 * @param definition - Solution 定义
 * @param parentWorkspacePath - 父级 workspace 路径
 * @returns Agent 实例
 */
export async function buildAgent(
  definition: SolutionDefinition,
  parentWorkspacePath: string,
): Promise<Agent> {
  const agentName = extractAgentName(definition.id);
  const agentDir = join(parentWorkspacePath, "agents", agentName);
  const agentWorkspacePath = join(agentDir, "workspace");

  // 1. 创建目录结构
  await mkdir(agentDir, { recursive: true });

  // 2. 写入 config.json
  const configPath = join(agentDir, "config.json");
  await writeFile(configPath, JSON.stringify(definition, null, 2), "utf-8");

  // 3. 写入 metadata.json
  const now = new Date().toISOString();
  const metadata: AgentMetadata = {
    agentId: definition.id,
    name: agentName,
    solutionId: definition.id,
    version: definition.version,
    createdAt: now,
    createdBy: "system",
  };
  const metadataPath = join(agentDir, "metadata.json");
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");

  // 4. 初始化 Agent 工作空间（同构递归）
  await initWorkspace(agentWorkspacePath);

  // 5. 构建 Agent 实例
  const memoryManager = createMemoryManager(agentWorkspacePath, definition.memory);
  const knowledgeBase = createKnowledgeBase(agentWorkspacePath, definition.knowledge);

  return {
    id: definition.id,
    name: agentName,
    definition,
    workspacePath: agentWorkspacePath,
    memoryManager,
    knowledgeBase,
    createdAt: now,
  };
}

/**
 * 加载已有 Agent 实例
 *
 * 从 workspace/agents/{name}/ 读取配置并构建运行时 Agent。
 *
 * @param agentName - Agent 名称
 * @param parentWorkspacePath - 父级 workspace 路径
 * @returns Agent 实例，不存在时返回 null
 */
export async function loadAgent(
  agentName: string,
  parentWorkspacePath: string,
): Promise<Agent | null> {
  const agentDir = join(parentWorkspacePath, "agents", agentName);
  const configPath = join(agentDir, "config.json");

  try {
    const raw = await readFile(configPath, "utf-8");
    const definition = JSON.parse(raw) as SolutionDefinition;
    const agentWorkspacePath = join(agentDir, "workspace");

    const metadataPath = join(agentDir, "metadata.json");
    let createdAt = new Date().toISOString();
    try {
      const metaRaw = await readFile(metadataPath, "utf-8");
      const meta = JSON.parse(metaRaw) as AgentMetadata;
      createdAt = meta.createdAt;
    } catch {
      // 元数据不存在，使用当前时间
    }

    const memoryManager = createMemoryManager(agentWorkspacePath, definition.memory);
    const knowledgeBase = createKnowledgeBase(agentWorkspacePath, definition.knowledge);

    return {
      id: definition.id,
      name: agentName,
      definition,
      workspacePath: agentWorkspacePath,
      memoryManager,
      knowledgeBase,
      createdAt,
    };
  } catch {
    return null;
  }
}

/**
 * 列出所有 Agent 实例
 */
export async function listAgents(
  parentWorkspacePath: string,
): Promise<readonly string[]> {
  const agentsDir = join(parentWorkspacePath, "agents");
  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(agentsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/** 从 solution ID 提取 agent 名称 */
function extractAgentName(solutionId: string): string {
  // solution:code-reviewer → code-reviewer
  return solutionId.replace(/^solution:/, "");
}

/** 默认 Agent 系统配置 */
export const DEFAULT_AGENT_CONFIG: AgentSystemConfig = {
  defaultMaxTurns: 50,
  knowledgeMaxTokens: 8000,
};
