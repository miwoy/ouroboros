/**
 * 知识库管理
 *
 * 管理 Agent 的知识文件：
 * - 静态文件加载（workspace/agents/{name}/knowledge/）
 * - Token 预算控制
 */

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { KnowledgeBase, KnowledgeConfig } from "./types.js";

/**
 * 创建知识库
 *
 * @param agentWorkspacePath - Agent 工作空间路径
 * @param config - 知识库配置
 */
export function createKnowledgeBase(
  agentWorkspacePath: string,
  config?: KnowledgeConfig,
): KnowledgeBase {
  const knowledgeDir = join(agentWorkspacePath, "knowledge");
  const defaultMaxTokens = config?.maxTokens ?? 8000;

  return {
    async loadAll(maxTokens?: number): Promise<string> {
      const limit = maxTokens ?? defaultMaxTokens;
      const files = await this.listFiles();

      if (files.length === 0) return "";

      const parts: string[] = [];
      let estimatedTokens = 0;

      for (const filePath of files) {
        try {
          const fullPath = join(knowledgeDir, filePath);
          const content = await readFile(fullPath, "utf-8");
          const fileTokens = estimateTokens(content);

          if (estimatedTokens + fileTokens > limit) break;

          parts.push(`### ${filePath}\n\n${content}`);
          estimatedTokens += fileTokens;
        } catch {
          // 文件读取失败，跳过
        }
      }

      // 加载静态文件
      if (config?.staticFiles) {
        for (const staticPath of config.staticFiles) {
          try {
            const content = await readFile(staticPath, "utf-8");
            const fileTokens = estimateTokens(content);

            if (estimatedTokens + fileTokens > limit) break;

            parts.push(`### ${staticPath}\n\n${content}`);
            estimatedTokens += fileTokens;
          } catch {
            // 静态文件读取失败，跳过
          }
        }
      }

      return parts.join("\n\n---\n\n");
    },

    async addFile(filePath: string, content: string): Promise<void> {
      await mkdir(knowledgeDir, { recursive: true });
      const fullPath = join(knowledgeDir, filePath);
      await mkdir(join(fullPath, ".."), { recursive: true });
      await writeFile(fullPath, content, "utf-8");
    },

    async listFiles(): Promise<readonly string[]> {
      try {
        const files = await readdir(knowledgeDir);
        return files.filter((f) => !f.startsWith(".")).sort();
      } catch {
        return [];
      }
    },
  };
}

/** 估算文本 token 数（每 4 字符约 1 token） */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
