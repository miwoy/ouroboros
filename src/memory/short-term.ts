/**
 * 短期记忆
 *
 * 完整交互记录，存于 workspace/prompts/memory/yyyy-MM-dd.md。
 * 按日期分隔，支持按日期加载。
 */

import { writeFile, readFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ShortTermMemory, MemoryEntry } from "./types.js";

/**
 * 创建短期记忆管理器
 *
 * @param workspacePath - workspace 根目录
 */
export function createShortTermMemory(workspacePath: string): ShortTermMemory {
  const memoryDir = join(workspacePath, "prompts", "memory");

  return {
    async append(entry: MemoryEntry): Promise<void> {
      await mkdir(memoryDir, { recursive: true });
      const date = extractDate(entry.timestamp);
      const filePath = join(memoryDir, `${date}.md`);

      // 格式化条目
      const formatted = formatEntry(entry);

      // 追加到文件
      let existing = "";
      try {
        existing = await readFile(filePath, "utf-8");
      } catch {
        // 文件不存在，创建新文件（含 frontmatter）
        existing = buildFrontmatter(date);
      }

      const updated = existing.trimEnd() + "\n\n" + formatted;
      await writeFile(filePath, updated, "utf-8");
    },

    async loadByDate(date: string): Promise<readonly MemoryEntry[]> {
      const filePath = join(memoryDir, `${date}.md`);
      try {
        const raw = await readFile(filePath, "utf-8");
        return parseEntries(raw, date);
      } catch {
        return [];
      }
    },

    async loadToday(): Promise<readonly MemoryEntry[]> {
      const today = formatDate(new Date());
      return this.loadByDate(today);
    },

    async listDates(): Promise<readonly string[]> {
      try {
        const files = await readdir(memoryDir);
        return files
          .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
          .map((f) => f.replace(".md", ""))
          .sort();
      } catch {
        return [];
      }
    },
  };
}

// ─── 内部函数 ──────────────────────────────────────────────────

/** 从 ISO timestamp 提取日期部分 */
function extractDate(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/** 格式化日期 */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 构建新记忆文件的 frontmatter */
function buildFrontmatter(date: string): string {
  return [
    "---",
    "type: memory",
    `name: "${date} 交互记录"`,
    `description: "${date} 的交互历史"`,
    `version: "1.0.0"`,
    "---",
    "",
  ].join("\n");
}

/** 格式化单条记忆条目 */
function formatEntry(entry: MemoryEntry): string {
  const time = entry.timestamp.slice(11, 19); // HH:mm:ss
  const lines: string[] = [];
  lines.push(`### [${time}] ${entry.type}`);
  lines.push("");
  lines.push(entry.content);

  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    lines.push("");
    lines.push(`> 元数据: ${JSON.stringify(entry.metadata)}`);
  }

  return lines.join("\n");
}

/** 从记忆文件内容解析记忆条目 */
function parseEntries(raw: string, date: string): readonly MemoryEntry[] {
  const entries: MemoryEntry[] = [];

  // 跳过 frontmatter
  let content = raw;
  if (content.startsWith("---")) {
    const endIdx = content.indexOf("---", 3);
    if (endIdx !== -1) {
      content = content.slice(endIdx + 3).trim();
    }
  }

  // 按 ### 分割条目
  const sections = content.split(/^###\s+/m).filter(Boolean);

  for (const section of sections) {
    const lines = section.split("\n");
    const header = lines[0]?.trim() ?? "";

    // 解析 header: [HH:mm:ss] type
    const match = header.match(/^\[(\d{2}:\d{2}:\d{2})\]\s+(.+)$/);
    if (!match) continue;

    const time = match[1];
    const type = match[2] as MemoryEntry["type"];
    const bodyLines = lines.slice(1).filter((l) => !l.startsWith("> 元数据:"));
    const body = bodyLines.join("\n").trim();

    // 解析元数据
    const metaLine = lines.find((l) => l.startsWith("> 元数据:"));
    let metadata: Record<string, unknown> | undefined;
    if (metaLine) {
      try {
        metadata = JSON.parse(metaLine.replace("> 元数据: ", ""));
      } catch {
        // 忽略解析失败
      }
    }

    entries.push({
      timestamp: `${date}T${time}`,
      type: isValidEntryType(type) ? type : "observation",
      content: body,
      metadata,
    });
  }

  return entries;
}

/** 校验记忆条目类型 */
function isValidEntryType(type: string): type is MemoryEntry["type"] {
  return ["conversation", "tool-call", "observation", "decision", "summary"].includes(type);
}
