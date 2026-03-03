/**
 * persistence 配置块 Schema
 *
 * 状态持久化与恢复。保持根级位置不变。
 */
import { z } from "zod/v4";

/**
 * 持久化系统配置 Schema
 */
export const persistenceConfigSchema = z.object({
  /** 是否启用持久化 */
  enabled: z.boolean().default(true),
  /** 检查点间隔（毫秒） */
  checkpointIntervalMs: z.number().int().positive().default(60000),
  /** 快照存储目录（相对 workspace） */
  snapshotDir: z.string().default("state"),
  /** 是否启用自动恢复 */
  enableAutoRecovery: z.boolean().default(true),
  /** 恢复 TTL（秒），超过此时间的快照不尝试恢复 */
  recoveryTTLSecs: z.number().int().positive().default(86400),
  /** 最大保留快照数 */
  maxSnapshots: z.number().int().positive().default(10),
});

// ─── 类型导出 ──────────────────────────────────────────────

export type PersistenceConfig = z.infer<typeof persistenceConfigSchema>;
