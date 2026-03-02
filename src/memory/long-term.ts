/**
 * 长期记忆
 *
 * 短期记忆的压缩摘要，存于 workspace/prompts/memory.md。
 * 包含：知识摘要、行为模式、重要决策。
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CallModelFn } from "../tool/types.js";
import type { LongTermMemory } from "./types.js";
import { createShortTermMemory } from "./short-term.js";

/**
 * 创建长期记忆管理器
 *
 * @param workspacePath - workspace 根目录
 */
export function createLongTermMemory(workspacePath: string): LongTermMemory {
  const memoryPath = join(workspacePath, "prompts", "memory.md");

  return {
    async load(): Promise<string> {
      try {
        return await readFile(memoryPath, "utf-8");
      } catch {
        return "";
      }
    },

    async appendKnowledge(content: string): Promise<void> {
      await appendToSection(memoryPath, "知识摘要", content);
    },

    async appendPattern(content: string): Promise<void> {
      await appendToSection(memoryPath, "行为模式", content);
    },

    async appendDecision(content: string): Promise<void> {
      await appendToSection(memoryPath, "重要决策", content);
    },

    async compressFromShortTerm(date: string, callModel: CallModelFn): Promise<string> {
      // 加载指定日期的短期记忆
      const shortTerm = createShortTermMemory(workspacePath);
      const entries = await shortTerm.loadByDate(date);

      if (entries.length === 0) {
        return "";
      }

      // 构造压缩提示词
      const entriesText = entries
        .map((e) => `[${e.timestamp}] [${e.type}] ${e.content}`)
        .join("\n");

      const compressPrompt = [
        "请将以下交互记录压缩为长期记忆摘要。",
        "分为三个部分输出（仅输出有意义的内容，无内容的部分省略）：",
        "",
        "## 知识摘要",
        "提炼关键知识点（可复用的信息）",
        "",
        "## 行为模式",
        "总结有效的行为流程和最佳实践",
        "",
        "## 重要决策",
        "记录关键决策及其结果",
        "",
        "---",
        "",
        "交互记录：",
        entriesText,
      ].join("\n");

      try {
        const response = await callModel({
          messages: [{ role: "user", content: compressPrompt }],
          temperature: 0.3,
          maxTokens: 1000,
        });

        const summary = response.content;

        // 将摘要追加到长期记忆
        if (summary) {
          const dateHeader = `\n\n### ${date} 摘要\n\n`;
          const raw = await this.load();
          const updated = raw.trimEnd() + dateHeader + summary;
          await writeFile(memoryPath, updated, "utf-8");
        }

        return summary;
      } catch {
        return "";
      }
    },
  };
}

// ─── 内部函数 ──────────────────────────────────────────────────

/** 在指定 section 下追加内容 */
async function appendToSection(filePath: string, sectionName: string, content: string): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    // 文件不存在，创建基础结构
    raw = buildDefaultLongTermMemory();
  }

  // 查找 section 位置
  const sectionHeader = `## ${sectionName}`;
  const sectionIdx = raw.indexOf(sectionHeader);

  if (sectionIdx === -1) {
    // Section 不存在，追加到末尾
    const updated = raw.trimEnd() + `\n\n${sectionHeader}\n\n- ${content}`;
    await writeFile(filePath, updated, "utf-8");
    return;
  }

  // 找到下一个 ## 或文件末尾
  const afterSection = raw.indexOf("\n## ", sectionIdx + sectionHeader.length);
  const insertPos = afterSection === -1 ? raw.length : afterSection;

  // 在 section 末尾追加
  const before = raw.slice(0, insertPos).trimEnd();
  const after = raw.slice(insertPos);
  const updated = before + `\n- ${content}` + after;
  await writeFile(filePath, updated, "utf-8");
}

/** 构建默认长期记忆文件 */
function buildDefaultLongTermMemory(): string {
  return [
    "---",
    "type: memory",
    'name: "长期记忆"',
    'description: "系统积累的知识库、行为模式和决策记录"',
    'version: "1.0.0"',
    "---",
    "",
    "# 长期记忆",
    "",
    "## 知识摘要",
    "",
    "## 行为模式",
    "",
    "## 重要决策",
    "",
  ].join("\n");
}
