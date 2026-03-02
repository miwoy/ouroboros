/**
 * tool:create-tool — 内置工具创建工具
 *
 * 流程：
 * 1. 生成 ID `tool:{kebab-case(name)}`
 * 2. 检查重复
 * 3. 计算 code SHA-256 hash
 * 4. 写入 workspace/tools/scripts/{name}.js
 * 5. 动态 import 验证导出格式
 * 6. 构建 OuroborosTool（status: 'active'，Phase 3 跳过审查）
 * 7. 调用 registry.register()
 */

import { createHash } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ToolExecutionError, ToolValidationError } from "../../errors/index.js";
import { createToolInputSchema } from "../schema.js";
import { EntityStatus, EntityType, type JSONSchema, type OuroborosTool, type ToolHandler } from "../types.js";

/** create-tool 工具处理函数 */
export const handleCreateTool: ToolHandler = async (input, context) => {
  // 校验输入
  const parsed = createToolInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ToolValidationError(`create-tool 输入校验失败: ${parsed.error.message}`);
  }

  const { name, description, inputSchema, outputSchema, code, tags } = parsed.data;

  // 1. 生成工具 ID
  const toolId = `tool:${toKebabCase(name)}`;

  // 2. 检查重复
  if (context.registry.has(toolId)) {
    throw new ToolValidationError(`工具 "${toolId}" 已存在`);
  }

  // 3. 计算代码 SHA-256 hash
  const codeHash = createHash("sha256").update(code).digest("hex");

  // 4. 写入脚本文件
  const scriptName = `${toKebabCase(name)}.js`;
  const scriptPath = join(context.workspacePath, "tools", "scripts", scriptName);
  await writeFile(scriptPath, code, "utf-8");

  // 5. 动态 import 验证导出格式
  try {
    const absolutePath = resolve(scriptPath);
    const moduleUrl = pathToFileURL(absolutePath).href;
    const mod = await import(moduleUrl);
    if (typeof mod.default !== "function") {
      // 清理无效脚本
      await safeUnlink(scriptPath);
      throw new ToolValidationError(
        `工具脚本必须导出默认函数（export default async function），实际导出类型: ${typeof mod.default}`,
      );
    }
  } catch (err) {
    if (err instanceof ToolValidationError) throw err;
    // 清理无效脚本
    await safeUnlink(scriptPath);
    throw new ToolExecutionError(
      `工具脚本加载失败: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  // 6. 构建 OuroborosTool
  const now = new Date().toISOString();
  const tool: OuroborosTool = {
    id: toolId,
    type: EntityType.Tool,
    name,
    description,
    tags,
    version: "1.0.0",
    status: EntityStatus.Active, // Phase 3 跳过审查，直接 active
    permissions: {},
    origin: "generated",
    createdAt: now,
    updatedAt: now,
    entrypoint: `scripts/${scriptName}`,
    inputSchema: inputSchema as JSONSchema,
    outputSchema: outputSchema as JSONSchema,
    metadata: { codeHash },
  };

  // 7. 注册到注册表
  await context.registry.register(tool);

  return {
    toolId: tool.id,
    entrypoint: tool.entrypoint,
    codeHash,
  };
};

/**
 * 将名称转换为 kebab-case
 * 支持中文（拼音化太复杂，保留中文但替换空格和特殊字符）
 */
function toKebabCase(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")       // 空格和下划线转连字符
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, "") // 保留英文、数字、中文、连字符
    .replace(/-+/g, "-")           // 合并多个连字符
    .replace(/^-|-$/g, "");        // 去除首尾连字符
}

/** 安全删除文件（忽略错误） */
async function safeUnlink(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // 忽略
  }
}
