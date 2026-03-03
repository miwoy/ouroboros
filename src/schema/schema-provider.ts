/**
 * 自我图式提供者
 *
 * 管理身体图式和激素系统，提供模板变量渲染所需的 8 个动态变量。
 * 灵魂内容（世界模型/身份/用户模型）已内联到 self.md 模板中，
 * 不再通过变量注入，由反思系统通过 replaceSection() 直接编辑。
 */

import { getBodySchema, getFullBodySchema } from "./body.js";
import { createHormoneManager } from "./hormone.js";
import type {
  SelfSchemaVariables,
  SelfSchemaConfig,
  BodySchema,
  HormoneManager,
} from "./types.js";

/**
 * 格式化当前系统时间为人类可读字符串
 */
function formatCurrentDateTime(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const weekday = weekdays[now.getDay()];
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} (星期${weekday}, ${tz})`;
}

/** 自我图式提供者 */
export interface SchemaProvider {
  /** 获取模板变量（8 个动态变量） */
  getVariables(): SelfSchemaVariables;
  /** 刷新身体图式（异步获取磁盘等信息） */
  refresh(): Promise<void>;
  /** 获取当前身体图式 */
  getBodySchema(): BodySchema;
  /** 获取激素管理器 */
  getHormoneManager(): HormoneManager;
}

/**
 * 创建自我图式提供者
 */
export async function createSchemaProvider(
  workspacePath: string,
  config?: Partial<SelfSchemaConfig>,
): Promise<SchemaProvider> {
  let bodySchema = getBodySchema(workspacePath);
  const hormoneManager = createHormoneManager(config?.hormoneDefaults);

  return {
    getVariables(): SelfSchemaVariables {
      const hormones = hormoneManager.getState();
      const gpuText =
        bodySchema.gpu.length > 0
          ? bodySchema.gpu
              .map((g) => `${g.name} (${g.memoryMB}MB, 利用率 ${g.utilization}%)`)
              .join("; ")
          : "无";
      return {
        platform: `${bodySchema.platform} (Node.js ${bodySchema.nodeVersion})`,
        availableMemory: `${bodySchema.memory.availableGB}GB / ${bodySchema.memory.totalGB}GB`,
        gpu: gpuText,
        workspacePath: bodySchema.workspacePath,
        currentDateTime: formatCurrentDateTime(),
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

    getHormoneManager(): HormoneManager {
      return hormoneManager;
    },
  };
}
