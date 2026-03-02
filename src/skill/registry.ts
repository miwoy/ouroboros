/**
 * 技能注册表
 *
 * 管理技能的注册、查找、持久化。
 * - 内存 Map 提供快速查找
 * - 从 workspace/skills/ 目录加载已有技能文件
 * - 注册时追加 skill.md 条目 + 更新 qmd 索引
 * - 内置技能（origin: 'system'）不持久化到文件
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { appendToPromptFile, getPromptFilePath } from "../prompt/store.js";
import { parseFrontmatter } from "../prompt/store.js";
import { isQmdAvailable, updateVectorIndex } from "../prompt/vector.js";
import { EntityStatus, type SkillDefinition, type SkillRegistry } from "./types.js";
import { getBuiltinSkillDefinitions } from "./builtin/definitions.js";

/**
 * 创建技能注册表
 *
 * 初始化时：
 * 1. 注册内置技能到内存
 * 2. 从 workspace/skills/ 加载用户技能
 *
 * @param workspacePath - workspace 根目录
 * @returns 技能注册表实例
 */
export async function createSkillRegistry(workspacePath: string): Promise<SkillRegistry> {
  const skills = new Map<string, SkillDefinition>();

  // 注册内置技能
  for (const skill of getBuiltinSkillDefinitions()) {
    skills.set(skill.id, skill);
  }

  // 加载已有用户技能
  const userSkills = await loadSkillFiles(workspacePath);
  for (const skill of userSkills) {
    skills.set(skill.id, skill);
  }

  const registry: SkillRegistry = {
    get(skillId: string): SkillDefinition | undefined {
      return skills.get(skillId);
    },

    has(skillId: string): boolean {
      return skills.has(skillId);
    },

    list(): readonly SkillDefinition[] {
      return [...skills.values()];
    },

    listByOrigin(origin: "system" | "user" | "generated"): readonly SkillDefinition[] {
      return [...skills.values()].filter((s) => s.origin === origin);
    },

    async register(skill: SkillDefinition): Promise<void> {
      skills.set(skill.id, skill);

      // 内置技能不持久化
      if (skill.origin === "system") return;

      // 追加 skill.md 条目
      const skillEntry = `| ${skill.name} | ${skill.id} | ${skill.description} | skills/${extractFileName(skill.id)}.md |`;
      const skillMdPath = getPromptFilePath(workspacePath, "skill");
      try {
        await appendToPromptFile(skillMdPath, skillEntry);
      } catch {
        // skill.md 不存在时忽略
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

    async updateStatus(skillId: string, status: EntityStatus): Promise<SkillDefinition> {
      const existing = skills.get(skillId);
      if (!existing) {
        throw new Error(`技能 "${skillId}" 不存在`);
      }

      const updated: SkillDefinition = {
        ...existing,
        status,
        updatedAt: new Date().toISOString(),
      };
      skills.set(skillId, updated);

      return updated;
    },
  };

  return registry;
}

// ─── 内部函数 ──────────────────────────────────────────────────

/** 从 workspace/skills/ 加载技能文件 */
async function loadSkillFiles(workspacePath: string): Promise<readonly SkillDefinition[]> {
  const skillsDir = join(workspacePath, "skills");
  const results: SkillDefinition[] = [];

  let entries: string[];
  try {
    entries = await readdir(skillsDir);
  } catch {
    return results; // 目录不存在
  }

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;

    try {
      const filePath = join(skillsDir, entry);
      const raw = await readFile(filePath, "utf-8");
      const skill = parseSkillFile(raw, entry);
      if (skill) {
        results.push(skill);
      }
    } catch {
      // 解析失败跳过
    }
  }

  return results;
}

/** 从 .md 文件解析 SkillDefinition */
function parseSkillFile(raw: string, fileName: string): SkillDefinition | null {
  const parsed = parseFrontmatter(raw);
  const { metadata, content } = parsed;
  if (metadata.type !== "skill") return null;

  const name = metadata.name || fileName.replace(".md", "");
  const now = new Date().toISOString();

  return {
    id: `skill:${fileName.replace(".md", "")}`,
    type: "skill" as const,
    name,
    description: metadata.description ?? "",
    tags: metadata.tags ?? [],
    version: metadata.version ?? "1.0.0",
    status: EntityStatus.Active,
    permissions: {},
    origin: "user",
    createdAt: now,
    updatedAt: now,
    promptTemplate: content,
    variables: metadata.variables ?? [],
    requiredTools: [],
    inputDescription: "",
    outputDescription: "",
  };
}

/** 从 skill ID 提取文件名部分 */
function extractFileName(skillId: string): string {
  return skillId.replace(/^skill:/, "");
}
