/**
 * handlers 上下文构建 + 记忆副作用
 *
 * 从 handlers.ts 抽取：
 * - 系统提示词构建（buildModelMessages / buildContextPrompt）
 * - 记忆写入（writebackMemory）
 * - 反思触发（triggerReflection）
 */

import type { SessionManager } from "./session.js";
import type { ApiDeps } from "./types.js";
import type { ExecutionTree, ReactStep } from "../core/types.js";
import type { Message } from "../model/types.js";
import type { RenderedPrompt, PromptFileType } from "../prompt/types.js";
import { loadUserPromptFiles, searchBySemantic } from "../prompt/loader.js";
import { renderTemplate } from "../prompt/template.js";
import { assemblePrompt } from "../prompt/assembler.js";

/** 默认 Agent ID */
export const DEFAULT_AGENT_ID = "agent:main";

/** 直连模式兜底提示词（schemaProvider 不可用时） */
const FALLBACK_SYSTEM_PROMPT =
  "你是 Ouroboros，一个智能助手。请用简洁、有帮助的方式回答用户的问题。";

/**
 * 从会话历史构建模型消息列表（直连模式用）
 */
export async function buildModelMessages(
  sessionManager: SessionManager,
  sessionId: string,
  deps: ApiDeps,
  message?: string,
): Promise<readonly Message[]> {
  const systemPrompt = (await buildContextPrompt(deps, message)) || FALLBACK_SYSTEM_PROMPT;
  const { messages } = sessionManager.getMessages(sessionId, 1, 200);
  const modelMessages: Message[] = [{ role: "system", content: systemPrompt }];
  for (const m of messages) {
    modelMessages.push({
      role: m.role === "agent" ? "assistant" : (m.role as "user" | "system"),
      content: m.content,
    });
  }
  return modelMessages;
}

/**
 * 构建用户级上下文提示词（self + tool + skill + agent + memory）
 * core.md 由 runReactLoop 内部加载，这里只拼装用户级部分。
 *
 * @param deps - API 依赖
 * @param message - 用户消息（用于短期记忆语义搜索）
 */
export async function buildContextPrompt(deps: ApiDeps, message?: string): Promise<string> {
  const promptFiles = await loadUserPromptFiles(deps.workspacePath);
  const parts: RenderedPrompt[] = [];

  // self.md — 需要 schemaProvider 渲染模板变量
  if (deps.schemaProvider) {
    const selfFile = promptFiles.get("self");
    if (selfFile) {
      const vars = deps.schemaProvider.getVariables();
      const rendered = renderTemplate(selfFile.content, vars as unknown as Record<string, string>);
      parts.push({ fileType: "self", content: rendered });
    }
  }

  // tool.md, skill.md, agent.md — 无模板变量，无条件加载
  for (const ft of ["tool", "skill", "agent"] as const) {
    const file = promptFiles.get(ft as PromptFileType);
    if (file) {
      parts.push({ fileType: ft as PromptFileType, content: file.content });
    }
  }

  // memory.md — 长期记忆
  const memoryFile = promptFiles.get("memory");
  if (memoryFile) {
    parts.push({ fileType: "memory", content: memoryFile.content });
  }

  // 追加 hot memory（内存中的会话记忆）
  if (deps.memoryManager) {
    const hotText = deps.memoryManager.hot.toPromptText();
    if (hotText) {
      parts.push({ fileType: "memory", content: hotText });
    }
  }

  // 短期记忆 — 基于用户消息语义搜索相关记忆片段
  if (message) {
    try {
      const memories = await searchBySemantic(deps.workspacePath, message, {
        limit: 3,
        threshold: 0.3,
      });
      for (const mem of memories) {
        if (mem.content) {
          parts.push({ fileType: "memory", content: `[记忆片段] ${mem.fileName}\n${mem.content}` });
        }
      }
    } catch {
      // 语义搜索失败不影响主流程
    }
  }

  if (parts.length === 0) return "";

  const assembled = assemblePrompt(parts);
  return assembled.systemPrompt;
}

/** 将对话记录写入记忆系统（fire-and-forget） */
export function writebackMemory(deps: ApiDeps, message: string, answer: string): void {
  if (!deps.memoryManager) return;

  const entry = {
    timestamp: new Date().toISOString(),
    type: "conversation" as const,
    content: `用户: ${message}\n助手: ${answer.slice(0, 500)}`,
  };

  deps.memoryManager.hot.add(entry);
  deps.memoryManager.shortTerm.append(entry).catch(() => {});
}

/** 触发反思（fire-and-forget） */
export function triggerReflection(
  deps: ApiDeps,
  message: string,
  result: {
    answer: string;
    executionTree: ExecutionTree;
    steps: readonly ReactStep[];
    totalDuration: number;
    stopReason: string;
  },
): void {
  if (!deps.reflector || result.stopReason !== "completed") return;

  deps.reflector
    .reflect({
      taskDescription: message,
      agentId: DEFAULT_AGENT_ID,
      executionTree: result.executionTree,
      steps: [...result.steps],
      result: result.answer,
      totalDuration: result.totalDuration,
      success: true,
      errors: [],
    })
    .catch((err: unknown) => {
      deps.logger.warn("api", "反思失败", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
}
