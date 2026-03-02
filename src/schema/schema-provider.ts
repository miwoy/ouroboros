/**
 * 自我图式提供者
 *
 * 统一管理身体图式、灵魂图式、激素系统，
 * 提供模板变量渲染所需的完整变量集。
 */

import { getBodySchema, getFullBodySchema } from "./body.js";
import { getDefaultSoulSchema, formatWorldModel, formatSelfAwareness } from "./soul.js";
import { createHormoneManager } from "./hormone.js";
import type {
  SelfSchemaVariables,
  SelfSchemaConfig,
  BodySchema,
  SoulSchema,
  HormoneManager,
} from "./types.js";

/** 自我图式提供者 */
export interface SchemaProvider {
  /** 获取模板变量（同步，用 body 快照） */
  getVariables(): SelfSchemaVariables;
  /** 刷新身体图式（异步获取磁盘等信息） */
  refresh(): Promise<void>;
  /** 获取当前身体图式 */
  getBodySchema(): BodySchema;
  /** 获取灵魂图式 */
  getSoulSchema(): SoulSchema;
  /** 获取激素管理器 */
  getHormoneManager(): HormoneManager;
}

/**
 * 创建自我图式提供者
 */
export function createSchemaProvider(
  workspacePath: string,
  config?: Partial<SelfSchemaConfig>,
): SchemaProvider {
  let bodySchema = getBodySchema(workspacePath);
  const soulSchema = getDefaultSoulSchema();
  const hormoneManager = createHormoneManager(config?.hormoneDefaults);

  return {
    getVariables(): SelfSchemaVariables {
      const hormones = hormoneManager.getState();
      return {
        platform: `${bodySchema.platform} (Node.js ${bodySchema.nodeVersion})`,
        availableMemory: `${bodySchema.memory.availableGB}GB / ${bodySchema.memory.totalGB}GB`,
        workspacePath: bodySchema.workspacePath,
        worldModel: formatWorldModel(soulSchema.worldModel),
        selfAwareness: formatSelfAwareness(soulSchema.selfAwareness),
        focusLevel: String(hormones.focusLevel),
        cautionLevel: String(hormones.cautionLevel),
        creativityLevel: String(hormones.creativityLevel),
      };
    },

    async refresh(): Promise<void> {
      bodySchema = await getFullBodySchema(workspacePath);
    },

    getBodySchema(): BodySchema {
      return bodySchema;
    },

    getSoulSchema(): SoulSchema {
      return soulSchema;
    },

    getHormoneManager(): HormoneManager {
      return hormoneManager;
    },
  };
}
