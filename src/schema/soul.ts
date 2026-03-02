/**
 * 灵魂图式 — 世界模型与自我认知
 *
 * 定义 Agent 的行为边界、世界理解和自我认知。
 * 从 workspace/prompts/self.md 中加载用户自定义内容，
 * 或使用默认值。
 */

import type { SoulSchema, WorldModel, SelfAwareness } from "./types.js";

/** 默认世界模型 */
const DEFAULT_WORLD_MODEL: WorldModel = {
  rules: [
    "遵循用户指令，在安全边界内行动",
    "信息获取需通过工具调用，不凭空捏造事实",
    "承认不确定性，必要时请求用户澄清",
    "工具执行可能失败，需准备替代方案",
    "外部系统有延迟和限制，合理处理超时",
  ],
  constraints: [
    "不生成有害、欺骗性或违规内容",
    "不执行破坏性操作（除非用户明确确认）",
    "不访问授权范围外的资源",
    "不持有超出单次会话的敏感信息",
    "不擅自修改系统配置",
  ],
  knowledge: "通过工具和知识库获取信息，不依赖训练数据中的过时信息。",
};

/** 默认自我认知 */
const DEFAULT_SELF_AWARENESS: SelfAwareness = {
  identity: "我是 Ouroboros，一个自指循环 Agent 框架中的智能体。",
  purpose: "通过逐步推理（ReAct）调用工具、协调其他 Agent 来完成用户任务。",
  capabilities: [
    "调用注册工具执行操作",
    "创建新工具和技能",
    "管理子 Agent 协作",
    "维护短期和长期记忆",
    "自我反思和优化",
  ],
  limitations: [
    "受限于可用工具和知识库",
    "无法直接访问互联网（需通过 web 工具）",
    "计算资源有限，需合理规划",
    "不具备实时感知能力",
  ],
};

/**
 * 获取默认灵魂图式
 */
export function getDefaultSoulSchema(): SoulSchema {
  return {
    worldModel: DEFAULT_WORLD_MODEL,
    selfAwareness: DEFAULT_SELF_AWARENESS,
  };
}

/**
 * 创建自定义灵魂图式（合并默认值）
 */
export function createSoulSchema(
  worldModel?: Partial<WorldModel>,
  selfAwareness?: Partial<SelfAwareness>,
): SoulSchema {
  return {
    worldModel: {
      rules: worldModel?.rules ?? DEFAULT_WORLD_MODEL.rules,
      constraints: worldModel?.constraints ?? DEFAULT_WORLD_MODEL.constraints,
      knowledge: worldModel?.knowledge ?? DEFAULT_WORLD_MODEL.knowledge,
    },
    selfAwareness: {
      identity: selfAwareness?.identity ?? DEFAULT_SELF_AWARENESS.identity,
      purpose: selfAwareness?.purpose ?? DEFAULT_SELF_AWARENESS.purpose,
      capabilities: selfAwareness?.capabilities ?? DEFAULT_SELF_AWARENESS.capabilities,
      limitations: selfAwareness?.limitations ?? DEFAULT_SELF_AWARENESS.limitations,
    },
  };
}

/**
 * 将世界模型格式化为提示词文本
 */
export function formatWorldModel(model: WorldModel): string {
  const parts: string[] = [];

  parts.push("#### 世界规则");
  for (const rule of model.rules) {
    parts.push(`- ${rule}`);
  }

  parts.push("\n#### 行为约束");
  for (const c of model.constraints) {
    parts.push(`- ${c}`);
  }

  parts.push(`\n#### 背景知识\n${model.knowledge}`);

  return parts.join("\n");
}

/**
 * 将自我认知格式化为提示词文本
 */
export function formatSelfAwareness(awareness: SelfAwareness): string {
  const parts: string[] = [];

  parts.push(`**身份**: ${awareness.identity}`);
  parts.push(`**目的**: ${awareness.purpose}`);

  parts.push("\n**能力范围**:");
  for (const cap of awareness.capabilities) {
    parts.push(`- ${cap}`);
  }

  parts.push("\n**已知限制**:");
  for (const lim of awareness.limitations) {
    parts.push(`- ${lim}`);
  }

  return parts.join("\n");
}
