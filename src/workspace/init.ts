/**
 * workspace 初始化
 *
 * 创建运行时工作空间目录结构，并将默认提示词模板复制到 workspace/prompts/。
 *
 * 目录结构:
 *   workspace/
 *   ├── prompts/           # 用户级别提示词
 *   │   ├── self.md        # 自我图式
 *   │   ├── tool.md        # 工具注册表
 *   │   ├── skill.md       # 技能注册表
 *   │   ├── agent.md       # Agent 注册表
 *   │   ├── memory.md      # 长期记忆
 *   │   └── memory/        # 短期记忆（按日期）
 *   ├── tools/             # 自定义工具
 *   ├── skills/            # 自定义技能
 *   ├── agents/            # Agent 实例及独立工作空间
 *   ├── logs/              # 日志
 *   ├── tmp/               # 临时文件
 *   └── vectors/           # qmd 索引数据
 */

import { mkdir, writeFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { copyDefaultTemplates } from "../prompt/store.js";
import type { ToolRegistryData } from "../tool/types.js";

/**
 * workspace 子目录定义
 * 注意：不再有 prompts/ 下的分类子目录，改为扁平 .md 文件
 */
const WORKSPACE_DIRS = [
  "prompts", // 提示词根目录
  "prompts/memory", // 短期记忆（按日期文件 yyyy-MM-dd.md）
  "tools", // 自定义工具
  "tools/scripts", // 自定义工具脚本
  "skills", // 自定义技能
  "agents", // Agent 实例及工作空间
  "solutions", // Solution 注册表
  "logs", // 日志（按日期分隔，格式 yyyy-MM-dd.log）
  "tmp", // 临时文件（任务完成后清理）
  "vectors", // 向量索引（qmd）
] as const;

/**
 * 初始化 workspace 工作空间
 *
 * 1. 创建所有必需的子目录
 * 2. 将默认提示词模板复制到 workspace/prompts/（幂等）
 *
 * @param workspacePath - workspace 根目录路径（默认 ./workspace）
 * @returns 创建的目录路径列表
 */
export async function initWorkspace(workspacePath = "./workspace"): Promise<readonly string[]> {
  const root = resolve(workspacePath);
  const created: string[] = [];

  // 创建目录结构
  for (const dir of WORKSPACE_DIRS) {
    const dirPath = join(root, dir);
    await mkdir(dirPath, { recursive: true });
    created.push(dirPath);
  }

  // 复制默认提示词模板
  await copyDefaultTemplates(root);

  // 初始化工具注册表文件（幂等）
  await initToolRegistry(root);

  return created;
}

/**
 * 初始化空的工具注册表文件
 * 如果 registry.json 已存在则跳过（幂等）
 */
async function initToolRegistry(workspacePath: string): Promise<void> {
  const registryPath = join(workspacePath, "tools", "registry.json");
  const exists = await fileExists(registryPath);
  if (exists) return;

  const emptyRegistry: ToolRegistryData = {
    version: "1.0.0",
    updatedAt: new Date().toISOString(),
    tools: [],
  };
  await writeFile(registryPath, JSON.stringify(emptyRegistry, null, 2), "utf-8");
}

/** 检查文件是否存在 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 为 Agent 创建独立的工作空间
 * 每个 Agent 有自己的 workspace 子目录结构
 *
 * @param workspacePath - 主 workspace 路径
 * @param agentName - Agent 名称
 * @returns Agent workspace 根路径
 */
export async function initAgentWorkspace(
  workspacePath: string,
  agentName: string,
): Promise<string> {
  const agentRoot = resolve(workspacePath, "agents", agentName, "workspace");

  // Agent 的工作空间包含基本子目录（与主 workspace 相同结构）
  const agentDirs = [
    "prompts",
    "prompts/memory",
    "tools",
    "tools/scripts",
    "skills",
    "logs",
    "tmp",
    "vectors",
  ] as const;

  for (const dir of agentDirs) {
    await mkdir(join(agentRoot, dir), { recursive: true });
  }

  // Agent workspace 也复制默认模板
  await copyDefaultTemplates(agentRoot);

  // Agent workspace 也初始化工具注册表
  await initToolRegistry(agentRoot);

  return agentRoot;
}
