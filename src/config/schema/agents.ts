/**
 * agents 配置块 Schema
 *
 * 变更：think + thinkLevel 合并为 thinkLevel（含 off 值）
 */
import { z } from "zod/v4";

/**
 * 单个 Agent 配置 Schema
 */
export const agentConfigSchema = z.object({
  /** 使用的模型，格式: "provider/model"（如 "ollama/llama3"） */
  model: z.string().min(1),
  /** workspace 根目录路径（相对 system.cwd） */
  workspacePath: z.string().default("./workspace"),
  /** 默认最大交互轮次 */
  maxTurns: z.number().int().positive().default(50),
  /** 知识库默认最大 token 数 */
  knowledgeMaxTokens: z.number().int().positive().default(8000),
  /**
   * Thinking 级别
   * - off: 关闭（默认）
   * - low: 低级推理
   * - medium: 中级推理
   * - high: 深度推理
   */
  thinkLevel: z.enum(["off", "low", "medium", "high"]).default("off"),
  /** 是否记录 Token 消耗统计（默认开启） */
  trackTokenUsage: z.boolean().default(true),
  // ── 旧格式兼容（migration 会处理） ──
  /** @deprecated 使用 thinkLevel 替代 */
  think: z.boolean().optional(),
});

/**
 * 顶层 agents 配置（必须包含 default）
 */
export const agentsBlockSchema = z
  .record(z.string(), agentConfigSchema)
  .refine((agents) => "default" in agents, {
    message: "agents 中必须包含 'default' Agent 配置",
  });

// ─── 类型导出 ──────────────────────────────────────────────

/** 单个 Agent 配置 */
export type AgentConfig = z.infer<typeof agentConfigSchema>;
