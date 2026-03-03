/**
 * 自我图式提供者
 *
 * 统一管理身体图式、灵魂图式、激素系统，
 * 提供模板变量渲染所需的完整变量集。
 * 支持 soul.json 持久化 + updateSoul() 动态更新。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getBodySchema, getFullBodySchema } from "./body.js";
import { getDefaultSoulSchema, formatWorldModel, formatSelfAwareness, formatUserModel } from "./soul.js";
import { createHormoneManager } from "./hormone.js";
import type {
  SelfSchemaVariables,
  SelfSchemaConfig,
  BodySchema,
  SoulSchema,
  SoulUpdate,
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

/** soul.json 持久化路径 */
function getSoulJsonPath(workspacePath: string): string {
  return join(workspacePath, "schema", "soul.json");
}

/** 从 soul.json 加载灵魂图式（不存在则返回默认值） */
async function loadSoulFromDisk(workspacePath: string): Promise<SoulSchema> {
  const defaults = getDefaultSoulSchema();
  try {
    const raw = await readFile(getSoulJsonPath(workspacePath), "utf-8");
    const data = JSON.parse(raw) as Partial<SoulSchema>;
    return {
      worldModel: {
        principles: data.worldModel?.principles ?? defaults.worldModel.principles,
        knowledge: data.worldModel?.knowledge ?? defaults.worldModel.knowledge,
      },
      selfAwareness: {
        name: data.selfAwareness?.name ?? defaults.selfAwareness.name,
        identity: data.selfAwareness?.identity ?? defaults.selfAwareness.identity,
        purpose: data.selfAwareness?.purpose ?? defaults.selfAwareness.purpose,
        capabilities: data.selfAwareness?.capabilities ?? defaults.selfAwareness.capabilities,
        limitations: data.selfAwareness?.limitations ?? defaults.selfAwareness.limitations,
      },
      userModel: {
        name: data.userModel?.name ?? defaults.userModel.name,
        preferences: data.userModel?.preferences ?? defaults.userModel.preferences,
        context: data.userModel?.context ?? defaults.userModel.context,
      },
    };
  } catch {
    return defaults;
  }
}

/** 将灵魂图式写入 soul.json */
async function saveSoulToDisk(workspacePath: string, soul: SoulSchema): Promise<void> {
  const dir = join(workspacePath, "schema");
  await mkdir(dir, { recursive: true });
  await writeFile(getSoulJsonPath(workspacePath), JSON.stringify(soul, null, 2), "utf-8");
}

/** 自我图式提供者 */
export interface SchemaProvider {
  /** 获取模板变量（同步，用 body 快照 + soul 内存态） */
  getVariables(): SelfSchemaVariables;
  /** 刷新身体图式（异步获取磁盘等信息） */
  refresh(): Promise<void>;
  /** 获取当前身体图式 */
  getBodySchema(): BodySchema;
  /** 获取灵魂图式 */
  getSoulSchema(): SoulSchema;
  /** 获取激素管理器 */
  getHormoneManager(): HormoneManager;
  /** 更新灵魂图式（反思系统调用），持久化到 soul.json */
  updateSoul(update: SoulUpdate): Promise<void>;
}

/**
 * 创建自我图式提供者
 */
export async function createSchemaProvider(
  workspacePath: string,
  config?: Partial<SelfSchemaConfig>,
): Promise<SchemaProvider> {
  let bodySchema = getBodySchema(workspacePath);
  let soulSchema = await loadSoulFromDisk(workspacePath);
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
        worldModel: formatWorldModel(soulSchema.worldModel),
        selfAwareness: formatSelfAwareness(soulSchema.selfAwareness),
        userModel: formatUserModel(soulSchema.userModel),
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

    async updateSoul(update: SoulUpdate): Promise<void> {
      soulSchema = {
        worldModel: {
          principles: update.worldModel?.principles ?? soulSchema.worldModel.principles,
          knowledge: update.worldModel?.knowledge ?? soulSchema.worldModel.knowledge,
        },
        selfAwareness: {
          name: update.selfAwareness?.name ?? soulSchema.selfAwareness.name,
          identity: update.selfAwareness?.identity ?? soulSchema.selfAwareness.identity,
          purpose: update.selfAwareness?.purpose ?? soulSchema.selfAwareness.purpose,
          capabilities: update.selfAwareness?.capabilities ?? soulSchema.selfAwareness.capabilities,
          limitations: update.selfAwareness?.limitations ?? soulSchema.selfAwareness.limitations,
        },
        userModel: {
          name: update.userModel?.name ?? soulSchema.userModel.name,
          preferences: update.userModel?.preferences ?? soulSchema.userModel.preferences,
          context: update.userModel?.context ?? soulSchema.userModel.context,
        },
      };
      await saveSoulToDisk(workspacePath, soulSchema);
    },
  };
}
