/**
 * Session 记忆实现
 *
 * - Hot Memory：内存常驻，估算 token 数
 * - Cold Memory：临时文件缓存（workspace/tmp/memory/）
 */

import { writeFile, readFile, readdir, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { HotMemory, ColdMemory, MemoryEntry } from "./types.js";

// ─── Hot Memory ──────────────────────────────────────────────────

/**
 * 创建 Hot Memory 实例
 *
 * 内存常驻，每次 callModel 注入。
 * Token 估算：每 4 个字符约 1 个 token。
 *
 * @param maxTokens - 最大 token 数（超过时自动丢弃旧条目）
 */
export function createHotMemory(maxTokens = 4000): HotMemory {
  let entries: MemoryEntry[] = [];

  return {
    getEntries(): readonly MemoryEntry[] {
      return entries;
    },

    add(entry: MemoryEntry): void {
      entries.push(entry);

      // 超出 token 限制时丢弃最旧的条目
      while (estimateTokensForEntries(entries) > maxTokens && entries.length > 1) {
        entries = entries.slice(1);
      }
    },

    estimateTokens(): number {
      return estimateTokensForEntries(entries);
    },

    toPromptText(): string {
      if (entries.length === 0) return "";

      return entries
        .map((e) => `[${e.timestamp}] [${e.type}] ${e.content}`)
        .join("\n");
    },

    clear(): void {
      entries = [];
    },
  };
}

/** 估算条目列表的 token 数（每 4 字符约 1 token） */
function estimateTokensForEntries(entries: readonly MemoryEntry[]): number {
  let chars = 0;
  for (const e of entries) {
    chars += e.timestamp.length + e.type.length + e.content.length + 10; // 格式化开销
  }
  return Math.ceil(chars / 4);
}

// ─── Cold Memory ──────────────────────────────────────────────────

/**
 * 创建 Cold Memory 实例
 *
 * 临时文件缓存到 workspace/tmp/memory/。
 * 任务结束后调用 cleanup() 清理。
 *
 * @param workspacePath - workspace 根目录
 */
export function createColdMemory(workspacePath: string): ColdMemory {
  const coldDir = join(workspacePath, "tmp", "memory");

  return {
    async cache(stepId: string, content: string): Promise<void> {
      await mkdir(coldDir, { recursive: true });
      const filePath = join(coldDir, `${sanitizeFileName(stepId)}.md`);
      await writeFile(filePath, content, "utf-8");
    },

    async load(stepId: string): Promise<string | null> {
      const filePath = join(coldDir, `${sanitizeFileName(stepId)}.md`);
      try {
        return await readFile(filePath, "utf-8");
      } catch {
        return null;
      }
    },

    async listSteps(): Promise<readonly string[]> {
      try {
        const files = await readdir(coldDir);
        return files
          .filter((f) => f.endsWith(".md"))
          .map((f) => f.replace(".md", ""));
      } catch {
        return [];
      }
    },

    async cleanup(): Promise<void> {
      try {
        await rm(coldDir, { recursive: true, force: true });
      } catch {
        // 忽略清理失败
      }
    },
  };
}

/** 清理文件名中的特殊字符 */
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}
