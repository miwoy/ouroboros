/**
 * 反思执行器
 *
 * 分析任务执行结果，生成知识摘要、行为模式、Skill 建议，
 * 并将反思结果写入长期记忆。
 */

import type {
  ReflectionInput,
  ReflectionOutput,
  ReflectionDeps,
  ReflectionConfig,
  SkillSuggestion,
} from "./types.js";

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
      let modelReflection: string;

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
        modelReflection = "";
      }

      // 3. 解析反思结果
      const output = parseReflectionOutput(modelReflection, input, toolPatterns, cfg);

      // 4. 写入长期记忆
      await writeToLongTermMemory(deps, input, output);

      deps.logger.info("reflection", "反思完成", {
        insights: output.insights.length,
        patterns: output.patterns.length,
        skillSuggestions: output.skillSuggestions.length,
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

  return { insights, patterns, skillSuggestions, memorySummary };
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
