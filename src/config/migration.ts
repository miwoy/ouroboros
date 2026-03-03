/**
 * 配置迁移：v1 → v2
 *
 * 自动检测旧版 v1 平铺格式并转换为 v2 层级格式。
 *
 * 映射关系：
 *   v1.providers     → v2.provider（复数→单数）
 *   v1.model         → v2.system.model
 *   v1.tools         → v2.system.tool
 *   v1.react         → v2.system.react
 *   v1.memory        → v2.system.memory
 *   v1.self          → v2.system.self
 *   v1.inspector     → v2.system.inspector
 *   v1.reflection    → v2.system.reflection
 *   v1.api           → v2.system.api
 *   v1.webSearch     → v2.tools.web.search
 *   v1.agents.*.think/thinkLevel → v2.agents.*.thinkLevel(含 off)
 *   v1.providers.*.type → v2.provider.*.api（类型映射）
 */

/** 旧 type → 新 api 协议映射 */
const TYPE_TO_API: Readonly<Record<string, string>> = {
  openai: "openai-completions",
  "openai-codex": "openai-completions",
  "openai-compatible": "openai-completions",
  "github-copilot": "openai-completions", // 默认走 openai，runtime 按模型名切换
  anthropic: "anthropic-messages",
  google: "google-generative-ai",
  "google-gemini-cli": "google-generative-ai",
  "google-antigravity": "google-generative-ai",
  mistral: "mistral-completions",
  groq: "groq-completions",
  bedrock: "bedrock-converse",
};

/**
 * 检测是否为 v1 配置（平铺格式）
 *
 * 判断依据：
 * - 存在 `providers`（复数）键且不存在 `provider`（单数）键
 * - 或者存在根级 `model`/`react`/`api` 等键
 */
export function isV1Config(raw: Record<string, unknown>): boolean {
  // 有 providers（复数）但没有 provider（单数）→ v1
  if ("providers" in raw && !("provider" in raw)) return true;
  // 有根级 model/react/api/webSearch → v1
  if ("model" in raw || "react" in raw || "webSearch" in raw) return true;
  // 有根级 api 但不在 system 内 → v1
  if ("api" in raw && typeof raw.system === "object" && raw.system !== null) {
    const system = raw.system as Record<string, unknown>;
    if (!("api" in system) && "api" in raw) return true;
  } else if ("api" in raw && !("system" in raw)) {
    return true;
  }
  return false;
}

/**
 * 将 v1 配置转换为 v2 格式
 *
 * 不可变：返回新对象，不修改输入
 */
export function migrateV1ToV2(v1: Record<string, unknown>): Record<string, unknown> {
  const v2: Record<string, unknown> = {};

  // ── system 块：合并旧的根级块 ──
  const oldSystem = (v1.system ?? {}) as Record<string, unknown>;
  const system: Record<string, unknown> = { ...oldSystem };

  // v1.model → v2.system.model
  if ("model" in v1 && v1.model !== undefined) {
    system.model = v1.model;
  }
  // v1.tools（工具执行参数）→ v2.system.tool（单数）
  if ("tools" in v1 && v1.tools !== undefined) {
    system.tool = v1.tools;
  }
  // v1.react → v2.system.react
  if ("react" in v1 && v1.react !== undefined) {
    system.react = v1.react;
  }
  // v1.memory → v2.system.memory
  if ("memory" in v1 && v1.memory !== undefined) {
    system.memory = v1.memory;
  }
  // v1.self → v2.system.self
  if ("self" in v1 && v1.self !== undefined) {
    system.self = v1.self;
  }
  // v1.inspector → v2.system.inspector
  if ("inspector" in v1 && v1.inspector !== undefined) {
    system.inspector = v1.inspector;
  }
  // v1.reflection → v2.system.reflection
  if ("reflection" in v1 && v1.reflection !== undefined) {
    system.reflection = v1.reflection;
  }
  // v1.api → v2.system.api
  if ("api" in v1 && v1.api !== undefined) {
    system.api = v1.api;
  }

  v2.system = system;

  // ── provider 块：providers(复数) → provider(单数) + type→api ──
  const oldProviders = (v1.providers ?? v1.provider ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const newProvider: Record<string, Record<string, unknown>> = {};

  for (const [name, cfg] of Object.entries(oldProviders)) {
    const newCfg: Record<string, unknown> = { ...cfg };

    // type → api
    if ("type" in newCfg && !("api" in newCfg)) {
      const typeStr = String(newCfg.type);
      const apiValue = TYPE_TO_API[typeStr];
      if (apiValue) {
        newCfg.api = apiValue;
      }
      // 保留 type 给 schema 的兼容处理
    }

    newProvider[name] = newCfg;
  }
  v2.provider = newProvider;

  // ── agents 块：think+thinkLevel → thinkLevel(含 off) ──
  const oldAgents = (v1.agents ?? {}) as Record<string, Record<string, unknown>>;
  const newAgents: Record<string, Record<string, unknown>> = {};

  for (const [name, agentCfg] of Object.entries(oldAgents)) {
    const newAgent: Record<string, unknown> = { ...agentCfg };

    // 合并 think + thinkLevel → thinkLevel
    if ("think" in newAgent) {
      const think = newAgent.think as boolean;
      if (!think) {
        // think=false → thinkLevel=off
        newAgent.thinkLevel = "off";
      } else if (!("thinkLevel" in newAgent) || newAgent.thinkLevel === undefined) {
        // think=true 且无 thinkLevel → 默认 medium
        newAgent.thinkLevel = "medium";
      }
      // thinkLevel 已有值且 think=true → 保持
      delete newAgent.think;
    }

    newAgents[name] = newAgent;
  }
  v2.agents = newAgents;

  // ── tools 块：webSearch → tools.web.search ──
  const toolsBlock: Record<string, unknown> = {};
  const webBlock: Record<string, unknown> = {};

  if ("webSearch" in v1 && v1.webSearch !== undefined) {
    const oldWs = v1.webSearch as Record<string, unknown>;
    webBlock.search = { enabled: true, ...oldWs };
  }
  // web.fetch 默认启用
  webBlock.fetch = { enabled: true };

  if (Object.keys(webBlock).length > 0) {
    toolsBlock.web = webBlock;
  }
  v2.tools = toolsBlock;

  // ── channels 块：默认空 ──
  v2.channels = {};

  // ── persistence 块：直接复制 ──
  if ("persistence" in v1) {
    v2.persistence = v1.persistence;
  }

  return v2;
}
