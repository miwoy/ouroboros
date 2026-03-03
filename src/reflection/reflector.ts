/**
 * 反思执行器
 *
 * 分析任务执行结果，生成知识摘要、行为模式、Skill 建议，
 * 评估是否需要更新自我图式，并将反思结果写入长期记忆。
 */

import type {
  ReflectionInput,
  ReflectionOutput,
  ReflectionDeps,
  ReflectionConfig,
  SkillSuggestion,
  SchemaUpdates,
} from "./types.js";
import type { SoulUpdate } from "../schema/types.js";

/** 默认反思配置 */
export const DEFAULT_REFLECTION_CONFIG: ReflectionConfig = {
  enabled: true,
  minSkillConfidence: 0.7,
};

/**
 * 创建反思器
 */
export function createReflector(deps: ReflectionDeps, config?: Partial<ReflectionConfig>) {
  const cfg: ReflectionConfig = {
    enabled: config?.enabled ?? DEFAULT_REFLECTION_CONFIG.enabled,
    minSkillConfidence: config?.minSkillConfidence ?? DEFAULT_REFLECTION_CONFIG.minSkillConfidence,
  };

  return {
    async reflect(input: ReflectionInput): Promise<ReflectionOutput> {
      if (!cfg.enabled) {
        return { insights: [], patterns: [], skillSuggestions: [], memorySummary: "" };
      }

      deps.logger.info("reflection", "开始反思", {
        task: input.taskDescription.slice(0, 100),
        success: input.success,
      });

      // 1. 提取工具使用模式
      const toolPatterns = extractToolPatterns(input);

      // 2. 使用模型生成反思摘要
      const reflectionPrompt = buildReflectionPrompt(input, toolPatterns);
      let modelReflection = "";

      try {
        const response = await deps.callModel({
          messages: [
            {
              role: "system",
              content: "你是一个反思分析器。请分析任务执行过程，提取知识和改进建议。",
            },
            { role: "user", content: reflectionPrompt },
          ],
        });
        modelReflection = response.content;
      } catch (err) {
        deps.logger.warn("reflection", "模型反思失败，使用基础分析", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // 3. 解析反思结果
      const output = parseReflectionOutput(modelReflection, input, toolPatterns, cfg);

      // 4. 写入长期记忆
      await writeToLongTermMemory(deps, input, output);

      // 5. 应用图式更新
      if (output.schemaUpdates && deps.schemaProvider) {
        await applySchemaUpdates(deps, output.schemaUpdates);
      }

      deps.logger.info("reflection", "反思完成", {
        insights: output.insights.length,
        patterns: output.patterns.length,
        skillSuggestions: output.skillSuggestions.length,
        hasSchemaUpdates: !!output.schemaUpdates,
      });

      return output;
    },
  };
}

// ─── 内部函数 ──────────────────────────────────────────────────

/** 提取工具使用模式 */
function extractToolPatterns(input: ReflectionInput): readonly string[] {
  const toolCounts = new Map<string, number>();

  for (const step of input.steps) {
    for (const tc of step.toolCalls) {
      toolCounts.set(tc.toolId, (toolCounts.get(tc.toolId) ?? 0) + 1);
    }
  }

  return [...toolCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tool, count]) => `${tool} (${count} 次)`);
}

/** 构建反思提示词 */
function buildReflectionPrompt(input: ReflectionInput, toolPatterns: readonly string[]): string {
  const parts: string[] = [];

  parts.push(`## 任务描述\n${input.taskDescription}`);
  parts.push(`\n## 执行结果\n- 状态: ${input.success ? "成功" : "失败"}`);
  parts.push(`- 步骤数: ${input.steps.length}`);
  parts.push(`- 耗时: ${Math.round(input.totalDuration / 1000)}s`);

  if (input.errors.length > 0) {
    parts.push(`\n## 错误记录\n${input.errors.map((e) => `- ${e}`).join("\n")}`);
  }

  if (toolPatterns.length > 0) {
    parts.push(`\n## 工具使用\n${toolPatterns.map((p) => `- ${p}`).join("\n")}`);
  }

  parts.push(`\n## 最终输出\n${input.result.slice(0, 500)}`);

  parts.push(`\n## 请分析以下内容（JSON 格式）：`);
  parts.push(`1. insights: 从本次执行中学到的知识（数组）`);
  parts.push(`2. patterns: 发现的可复用行为模式（数组）`);
  parts.push(`3. memorySummary: 一句话总结（字符串）`);
  parts.push(`4. schemaUpdates: 基于对话内容，判断是否需要更新图式（JSON）：`);
  parts.push(`   - identityUpdate: 用户是否为 Agent 定义了名字/角色/目的？`);
  parts.push(`   - userUpdate: 用户是否透露了自己的信息（名字/偏好/背景）？`);
  parts.push(`   - worldModelUpdate: 本次对话是否揭示了新的普适性原则？`);
  parts.push(`   仅在有明确依据时返回，不要猜测。`);

  return parts.join("\n");
}

/** 解析反思输出 */
function parseReflectionOutput(
  modelResponse: string,
  input: ReflectionInput,
  toolPatterns: readonly string[],
  config: ReflectionConfig,
): ReflectionOutput {
  let insights: string[] = [];
  let patterns: string[] = [];
  let memorySummary = "";
  let schemaUpdates: SchemaUpdates | undefined;

  // 尝试解析 JSON
  try {
    const jsonMatch = modelResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      if (Array.isArray(parsed["insights"])) {
        insights = parsed["insights"].filter((i): i is string => typeof i === "string");
      }
      if (Array.isArray(parsed["patterns"])) {
        patterns = parsed["patterns"].filter((p): p is string => typeof p === "string");
      }
      if (typeof parsed["memorySummary"] === "string") {
        memorySummary = parsed["memorySummary"];
      }
      if (parsed["schemaUpdates"] && typeof parsed["schemaUpdates"] === "object") {
        schemaUpdates = parseSchemaUpdates(parsed["schemaUpdates"] as Record<string, unknown>);
      }
    }
  } catch {
    // JSON 解析失败，使用基础分析
  }

  // 回退：基础分析
  if (insights.length === 0) {
    insights = [
      `任务 "${input.taskDescription.slice(0, 50)}" ${input.success ? "成功完成" : "执行失败"}`,
      `使用了 ${input.steps.length} 个步骤，耗时 ${Math.round(input.totalDuration / 1000)}s`,
    ];
  }

  if (!memorySummary) {
    memorySummary = `${input.success ? "成功" : "失败"}完成任务: ${input.taskDescription.slice(0, 80)}`;
  }

  // 生成 Skill 建议
  const skillSuggestions = generateSkillSuggestions(input, toolPatterns, config);

  return { insights, patterns, skillSuggestions, memorySummary, schemaUpdates };
}

/** 解析图式更新建议 */
function parseSchemaUpdates(raw: Record<string, unknown>): SchemaUpdates | undefined {
  const updates: SchemaUpdates = {};
  let hasUpdates = false;

  if (raw["identityUpdate"] && typeof raw["identityUpdate"] === "object") {
    const iu = raw["identityUpdate"] as Record<string, unknown>;
    const identityUpdate: { name?: string; identity?: string; purpose?: string } = {};
    if (typeof iu["name"] === "string" && iu["name"]) {
      identityUpdate.name = iu["name"];
    }
    if (typeof iu["identity"] === "string" && iu["identity"]) {
      identityUpdate.identity = iu["identity"];
    }
    if (typeof iu["purpose"] === "string" && iu["purpose"]) {
      identityUpdate.purpose = iu["purpose"];
    }
    if (Object.keys(identityUpdate).length > 0) {
      (updates as { identityUpdate: typeof identityUpdate }).identityUpdate = identityUpdate;
      hasUpdates = true;
    }
  }

  if (raw["userUpdate"] && typeof raw["userUpdate"] === "object") {
    const uu = raw["userUpdate"] as Record<string, unknown>;
    const userUpdate: { name?: string; preferences?: readonly string[]; context?: string } = {};
    if (typeof uu["name"] === "string" && uu["name"]) {
      userUpdate.name = uu["name"];
    }
    if (Array.isArray(uu["preferences"])) {
      const prefs = uu["preferences"].filter((p): p is string => typeof p === "string");
      if (prefs.length > 0) {
        userUpdate.preferences = prefs;
      }
    }
    if (typeof uu["context"] === "string" && uu["context"]) {
      userUpdate.context = uu["context"];
    }
    if (Object.keys(userUpdate).length > 0) {
      (updates as { userUpdate: typeof userUpdate }).userUpdate = userUpdate;
      hasUpdates = true;
    }
  }

  if (raw["worldModelUpdate"] && typeof raw["worldModelUpdate"] === "object") {
    const wmu = raw["worldModelUpdate"] as Record<string, unknown>;
    if (Array.isArray(wmu["newPrinciples"])) {
      const principles = wmu["newPrinciples"].filter((p): p is string => typeof p === "string");
      if (principles.length > 0) {
        (updates as { worldModelUpdate: { newPrinciples: readonly string[] } }).worldModelUpdate = {
          newPrinciples: principles,
        };
        hasUpdates = true;
      }
    }
  }

  return hasUpdates ? updates : undefined;
}

/** 将图式更新应用到 SchemaProvider */
async function applySchemaUpdates(
  deps: ReflectionDeps,
  schemaUpdates: SchemaUpdates,
): Promise<void> {
  if (!deps.schemaProvider) return;

  try {
    const update: SoulUpdate = {};

    if (schemaUpdates.identityUpdate) {
      (update as { selfAwareness: typeof schemaUpdates.identityUpdate }).selfAwareness =
        schemaUpdates.identityUpdate;
    }

    if (schemaUpdates.userUpdate) {
      (update as { userModel: typeof schemaUpdates.userUpdate }).userModel =
        schemaUpdates.userUpdate;
    }

    if (schemaUpdates.worldModelUpdate?.newPrinciples) {
      // 新原则追加到现有原则列表
      const current = deps.schemaProvider.getSoulSchema();
      const merged = [
        ...current.worldModel.principles,
        ...schemaUpdates.worldModelUpdate.newPrinciples,
      ];
      (update as { worldModel: { principles: readonly string[] } }).worldModel = {
        principles: merged,
      };
    }

    await deps.schemaProvider.updateSoul(update);
    deps.logger.info("reflection", "图式已更新", { schemaUpdates });
  } catch (err) {
    deps.logger.warn("reflection", "图式更新失败", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** 生成 Skill 封装建议 */
function generateSkillSuggestions(
  input: ReflectionInput,
  _toolPatterns: readonly string[],
  config: ReflectionConfig,
): readonly SkillSuggestion[] {
  // 仅对成功任务且步骤数 ≥ 3 的任务建议 Skill
  if (!input.success || input.steps.length < 3) return [];

  const toolIds = new Set<string>();
  for (const step of input.steps) {
    for (const tc of step.toolCalls) {
      toolIds.add(tc.toolId);
    }
  }

  if (toolIds.size < 2) return [];

  // 简单启发式：步骤数越多、工具种类越多，置信度越高
  const confidence = Math.min(0.9, 0.4 + toolIds.size * 0.1 + input.steps.length * 0.05);

  if (confidence < config.minSkillConfidence) return [];

  return [
    {
      name: input.taskDescription.slice(0, 30).replace(/[^\w\u4e00-\u9fff]/g, "-"),
      description: `自动化执行: ${input.taskDescription.slice(0, 80)}`,
      toolsUsed: [...toolIds],
      confidence: Math.round(confidence * 100) / 100,
    },
  ];
}

/** 写入长期记忆 */
async function writeToLongTermMemory(
  deps: ReflectionDeps,
  _input: ReflectionInput,
  output: ReflectionOutput,
): Promise<void> {
  try {
    if (output.memorySummary) {
      await deps.longTermMemory.appendKnowledge(output.memorySummary);
    }

    for (const pattern of output.patterns) {
      await deps.longTermMemory.appendPattern(pattern);
    }
  } catch (err) {
    deps.logger.warn("reflection", "写入长期记忆失败", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
