/**
 * 模板引擎
 *
 * 提供 {{variable}} 格式的模板变量替换、提取和校验功能。
 * 对应 PROTOCOL.md 中 Skill 层的 promptTemplate 模板引擎。
 */

import { OuroborosError } from "../errors/index.js";
import type { TemplateVariable } from "./types.js";

/** 模板变量匹配正则：严格匹配 {{varName}}，不含空格 */
const VARIABLE_PATTERN = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

/**
 * 从模板内容中提取所有变量名（去重）
 *
 * @param content - 模板内容
 * @returns 变量名列表（去重、保持首次出现顺序）
 */
export function extractVariables(content: string): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const match of content.matchAll(VARIABLE_PATTERN)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }

  return result;
}

/**
 * 校验必填变量是否已提供
 *
 * @param declarations - 变量声明列表
 * @param values - 实际提供的变量值
 * @returns 缺失的必填变量名列表
 */
export function validateVariables(
  declarations: readonly TemplateVariable[],
  values: Record<string, string>,
): readonly string[] {
  return declarations
    .filter((decl) => decl.required && !(decl.name in values))
    .map((decl) => decl.name);
}

/**
 * 渲染模板：将 {{varName}} 替换为实际值
 *
 * 规则：
 * 1. 提供了值的变量 → 替换
 * 2. 未提供但有 defaultValue 的可选变量 → 用 defaultValue 替换
 * 3. 未提供且无 defaultValue 的可选变量 → 用空字符串替换
 * 4. 未声明的变量（不在 declarations 中也不在 values 中）→ 保持原样
 * 5. 必填变量未提供 → 抛出错误
 *
 * @param content - 模板内容
 * @param variables - 变量值（Map 或 Record）
 * @param declarations - 变量声明列表（可选，用于校验和默认值）
 * @returns 渲染后的字符串
 */
export function renderTemplate(
  content: string,
  variables: ReadonlyMap<string, string> | Record<string, string>,
  declarations?: readonly TemplateVariable[],
): string {
  // 统一转换为 Record
  const values: Record<string, string> =
    variables instanceof Map
      ? Object.fromEntries(variables)
      : { ...variables };

  // 有声明时，校验必填变量
  if (declarations) {
    const missing = validateVariables(declarations, values);
    if (missing.length > 0) {
      throw new TemplateError(`缺少必填模板变量: ${missing.join(", ")}`);
    }

    // 为未提供的可选变量填充默认值
    for (const decl of declarations) {
      if (!(decl.name in values)) {
        values[decl.name] = decl.defaultValue ?? "";
      }
    }
  }

  // 替换模板变量
  return content.replace(VARIABLE_PATTERN, (match, name: string) => {
    if (name in values) {
      return values[name];
    }
    // 未声明的变量保持原样
    return match;
  });
}

/** 模板相关错误 */
export class TemplateError extends OuroborosError {
  constructor(message: string, cause?: unknown) {
    super(message, "TEMPLATE_ERROR", cause);
    this.name = "TemplateError";
  }
}
