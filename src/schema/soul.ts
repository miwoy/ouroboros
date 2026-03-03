/**
 * Soul Schema — World Model & Self Awareness & User Model
 *
 * 定义 Agent 的世界观公理、自我认知、用户模型。
 * 可被反思系统通过 updateSoul() 更新，持久化到 workspace/schema/soul.json。
 */

import type { SoulSchema, WorldModel, SelfAwareness, UserModel } from "./types.js";

/** 默认世界模型 — 5 条普适性逻辑原则 */
const DEFAULT_WORLD_MODEL: WorldModel = {
  principles: [
    "自我指涉 — 统一事物存在二象性（静态/动态）。世界本质建立在自指命题下，自指命题一生二二生三三生万物，推动时间走向。",
    "最小作用量 — 自指事物的发展总是自发沿着时间最短的路径发展。",
    "熵增 — 唯一的动力是高能量密度向低能量密度的自发转移。生命的意义是主动制造负熵，所有规则文明制度源于此。",
    "分形 — 世界按最小的自指性逻辑螺旋演化，产生大量分形结构。",
    "均衡 — 物极必反。",
  ],
  knowledge:
    "Retrieve information through tools and knowledge bases. Do not rely on stale training data.",
};

/** 默认自我认知 — 最小化默认值，由反思系统逐步完善 */
const DEFAULT_SELF_AWARENESS: SelfAwareness = {
  name: "",
  identity:
    "I am an agent of the Ouroboros framework. My specific identity has not yet been established.",
  purpose:
    "Assist the user through iterative reasoning, tool orchestration, and self-reflection.",
  capabilities: [
    "Execute registered tools (file I/O, shell, web, model calls)",
    "Create new tools and skills on the fly",
    "Spawn and coordinate sub-agents",
    "Maintain short-term and long-term memory",
    "Self-reflect and optimize strategies",
  ],
  limitations: [
    "Bound by available tools and knowledge bases",
    "Internet access only through web tools",
    "Finite compute resources — plan accordingly",
    "No real-time sensory perception",
  ],
};

/** 默认用户模型 — 空白，通过对话逐步学习 */
const DEFAULT_USER_MODEL: UserModel = {
  name: "",
  preferences: [],
  context: "",
};

/**
 * 获取默认灵魂图式
 */
export function getDefaultSoulSchema(): SoulSchema {
  return {
    worldModel: DEFAULT_WORLD_MODEL,
    selfAwareness: DEFAULT_SELF_AWARENESS,
    userModel: DEFAULT_USER_MODEL,
  };
}

/**
 * 创建自定义灵魂图式（与默认值合并）
 */
export function createSoulSchema(
  worldModel?: Partial<WorldModel>,
  selfAwareness?: Partial<SelfAwareness>,
  userModel?: Partial<UserModel>,
): SoulSchema {
  return {
    worldModel: {
      principles: worldModel?.principles ?? DEFAULT_WORLD_MODEL.principles,
      knowledge: worldModel?.knowledge ?? DEFAULT_WORLD_MODEL.knowledge,
    },
    selfAwareness: {
      name: selfAwareness?.name ?? DEFAULT_SELF_AWARENESS.name,
      identity: selfAwareness?.identity ?? DEFAULT_SELF_AWARENESS.identity,
      purpose: selfAwareness?.purpose ?? DEFAULT_SELF_AWARENESS.purpose,
      capabilities: selfAwareness?.capabilities ?? DEFAULT_SELF_AWARENESS.capabilities,
      limitations: selfAwareness?.limitations ?? DEFAULT_SELF_AWARENESS.limitations,
    },
    userModel: {
      name: userModel?.name ?? DEFAULT_USER_MODEL.name,
      preferences: userModel?.preferences ?? DEFAULT_USER_MODEL.preferences,
      context: userModel?.context ?? DEFAULT_USER_MODEL.context,
    },
  };
}

/**
 * 格式化世界模型为提示词文本
 */
export function formatWorldModel(model: WorldModel): string {
  const parts: string[] = [];

  for (let i = 0; i < model.principles.length; i++) {
    parts.push(`${i + 1}. ${model.principles[i]}`);
  }

  parts.push(`\n**Knowledge**: ${model.knowledge}`);

  return parts.join("\n");
}

/**
 * 格式化自我认知为提示词文本
 */
export function formatSelfAwareness(awareness: SelfAwareness): string {
  const parts: string[] = [];

  if (awareness.name) {
    parts.push(`**Name**: ${awareness.name}`);
  }
  parts.push(`**Identity**: ${awareness.identity}`);
  parts.push(`**Purpose**: ${awareness.purpose}`);

  parts.push("\n**Capabilities**:");
  for (const cap of awareness.capabilities) {
    parts.push(`- ${cap}`);
  }

  parts.push("\n**Limitations**:");
  for (const lim of awareness.limitations) {
    parts.push(`- ${lim}`);
  }

  return parts.join("\n");
}

/**
 * 格式化用户模型为提示词文本
 */
export function formatUserModel(userModel: UserModel): string {
  const hasData = userModel.name || userModel.preferences.length > 0 || userModel.context;

  if (!hasData) {
    return "Not yet known.";
  }

  const parts: string[] = [];

  if (userModel.name) {
    parts.push(`**Name**: ${userModel.name}`);
  }

  if (userModel.preferences.length > 0) {
    parts.push("\n**Preferences**:");
    for (const pref of userModel.preferences) {
      parts.push(`- ${pref}`);
    }
  }

  if (userModel.context) {
    parts.push(`\n**Context**: ${userModel.context}`);
  }

  return parts.join("\n");
}
