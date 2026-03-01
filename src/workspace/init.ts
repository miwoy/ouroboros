import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * workspace 子目录定义
 * 所有动态内容都存储在这些目录中
 */
const WORKSPACE_DIRS = [
  "prompts", // 动态提示词
  "tools", // 自定义工具
  "skills", // 自定义技能
  "agents", // Agent 实例及工作空间
  "logs", // 日志（按日期分隔，格式 yyyy-MM-dd.log）
  "memory", // 短期记忆（按日期分隔，格式 yyyy-MM-dd.md）
  "tmp", // 临时文件（任务完成后清理）
] as const;

/**
 * 初始化 workspace 工作空间
 * 创建所有必需的子目录，已存在的目录不会受影响
 *
 * @param workspacePath - workspace 根目录路径（默认 ./workspace）
 * @returns 创建的目录路径列表
 */
export async function initWorkspace(workspacePath = "./workspace"): Promise<readonly string[]> {
  const root = resolve(workspacePath);
  const created: string[] = [];

  for (const dir of WORKSPACE_DIRS) {
    const dirPath = join(root, dir);
    await mkdir(dirPath, { recursive: true });
    created.push(dirPath);
  }

  return created;
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

  // Agent 的工作空间也包含基本子目录
  const agentDirs = ["prompts", "tools", "skills", "logs", "memory", "tmp"] as const;

  for (const dir of agentDirs) {
    await mkdir(join(agentRoot, dir), { recursive: true });
  }

  return agentRoot;
}
