/**
 * tool:create-skill — 技能创建
 *
 * 创建新的自定义技能：
 * 1. 生成 Skill 定义
 * 2. 写入提示词模板文件
 * 3. 追加到 skill.md 注册表
 * 4. 更新 qmd 向量索引
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { appendToPromptFile, getPromptFilePath } from "../../prompt/store.js";
import type { ToolHandler } from "../types.js";

/** create-skill 工具处理函数 */
export const handleCreateSkill: ToolHandler = async (input, context) => {
  const name = input["name"] as string;
  const description = input["description"] as string;
  const promptTemplate = input["promptTemplate"] as string;
  const requiredTools = (input["requiredTools"] as string[] | undefined) ?? [];
  const variables = (input["variables"] as Record<string, unknown>[] | undefined) ?? [];
  const tags = (input["tags"] as string[] | undefined) ?? [];

  // 生成 skill ID
  const skillId = `skill:${toKebabCase(name)}`;

  // 写入提示词模板文件
  const skillsDir = join(context.workspacePath, "skills");
  await mkdir(skillsDir, { recursive: true });

  const templatePath = join(skillsDir, `${toKebabCase(name)}.md`);
  const templateContent = [
    "---",
    `type: skill`,
    `name: "${name}"`,
    `description: "${description}"`,
    tags.length > 0 ? `tags: [${tags.map((t) => `"${t}"`).join(", ")}]` : "",
    `version: "1.0.0"`,
    variables.length > 0 ? "variables:" : "",
    ...variables.map((v) =>
      [
        `  - name: "${v["name"]}"`,
        `    description: "${v["description"]}"`,
        `    required: ${v["required"] ?? true}`,
        v["defaultValue"] ? `    defaultValue: "${v["defaultValue"]}"` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    "---",
    "",
    promptTemplate,
  ]
    .filter((line) => line !== "")
    .join("\n");

  await writeFile(templatePath, templateContent, "utf-8");

  // 追加到 skill.md 注册表
  const skillEntry = `| ${name} | ${skillId} | ${description} | skills/${toKebabCase(name)}.md |`;
  try {
    const skillMdPath = getPromptFilePath(context.workspacePath, "skill");
    await appendToPromptFile(skillMdPath, skillEntry);
  } catch {
    // skill.md 不存在时忽略（workspace 可能未初始化完整）
  }

  return {
    skillId,
    templatePath,
    requiredTools,
    variableCount: variables.length,
  };
};

/** 转换为 kebab-case */
function toKebabCase(str: string): string {
  return str
    .replace(/[\s_]+/g, "-")
    .replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
    .replace(/^-/, "")
    .replace(/-+/g, "-")
    .toLowerCase();
}
