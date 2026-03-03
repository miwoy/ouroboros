/**
 * 反思执行器
 *
 * 分析任务执行结果，生成知识摘要、行为模式、Skill 建议，
 * 评估是否需要更新 self.md 章节，并将反思结果写入长期记忆。
 */

import type {
  ReflectionInput,
  ReflectionOutput,
  ReflectionDeps,
  ReflectionConfig,
  SkillSuggestion,
  SelfUpdates,
} from "./types.js";
import { getPromptFilePath, readSection, replaceSection } from "../prompt/store.js";

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

      // 5. 应用 self.md 章节更新
      if (output.selfUpdates) {
        await applySelfUpdates(deps, output.selfUpdates);
      }

      deps.logger.info("reflection", "反思完成", {
        insights: output.insights.length,
        patterns: output.patterns.length,
        skillSuggestions: output.skillSuggestions.length,
        hasSelfUpdates: !!output.selfUpdates,
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
  parts.push(`4. selfUpdates: 基于对话内容，判断是否需要更新 self.md 章节（JSON）：`);
  parts.push(`   - identityUpdate: 用户是否为 Agent 定义了新的身份描述？（完整 markdown 文本）`);
  parts.push(`   - userUpdate: 用户是否透露了自己的信息？（完整 markdown 文本）`);
  parts.push(`   - worldModelUpdate: 本次对话是否揭示了新的普适性原则？（追加内容）`);
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
  let selfUpdates: SelfUpdates | undefined;

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
      if (parsed["selfUpdates"] && typeof parsed["selfUpdates"] === "object") {
        selfUpdates = parseSelfUpdates(parsed["selfUpdates"] as Record<string, unknown>);
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

  return { insights, patterns, skillSuggestions, memorySummary, selfUpdates };
}

/** 解析 self.md 章节更新建议 */
function parseSelfUpdates(raw: Record<string, unknown>): SelfUpdates | undefined {
  const updates: {
    identityUpdate?: string;
    userUpdate?: string;
    worldModelUpdate?: string;
  } = {};
  let hasUpdates = false;

  if (typeof raw["identityUpdate"] === "string" && raw["identityUpdate"]) {
    updates.identityUpdate = raw["identityUpdate"];
    hasUpdates = true;
  }

  if (typeof raw["userUpdate"] === "string" && raw["userUpdate"]) {
    updates.userUpdate = raw["userUpdate"];
    hasUpdates = true;
  }

  if (typeof raw["worldModelUpdate"] === "string" && raw["worldModelUpdate"]) {
    updates.worldModelUpdate = raw["worldModelUpdate"];
    hasUpdates = true;
  }

  return hasUpdates ? updates : undefined;
}

/**
 * 将 self.md 章节更新应用到 workspace/prompts/self.md
 *
 * - identityUpdate → 替换 ### Identity 章节
 * - userUpdate → 替换 ### User 章节
 * - worldModelUpdate → 追加到 ### World Model 章节
 */
async function applySelfUpdates(deps: ReflectionDeps, selfUpdates: SelfUpdates): Promise<void> {
  const selfPath = getPromptFilePath(deps.workspacePath, "self");

  try {
    if (selfUpdates.identityUpdate) {
      await replaceSection(selfPath, "Identity", selfUpdates.identityUpdate, 3);
    }

    if (selfUpdates.userUpdate) {
      await replaceSection(selfPath, "User", selfUpdates.userUpdate, 3);
    }

    if (selfUpdates.worldModelUpdate) {
      // worldModelUpdate 是追加内容，先读现有再合并
      const existing = await readSection(selfPath, "World Model", 3);
      const merged = existing
        ? `${existing.trimEnd()}\n${selfUpdates.worldModelUpdate}`
        : selfUpdates.worldModelUpdate;
      await replaceSection(selfPath, "World Model", merged, 3);
    }

    deps.logger.info("reflection", "self.md 章节已更新", { selfUpdates });
  } catch (err) {
    deps.logger.warn("reflection", "self.md 章节更新失败", {
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
