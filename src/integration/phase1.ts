/**
 * 阶段一：系统完整性测试
 *
 * 验证目标：
 * 使用 callModel 接口调用模型提供商，发送 "请回复：你好，Ouroboros"，
 * 验证返回包含 "Ouroboros" 的文本响应，且响应格式正确。
 *
 * 使用方式：
 *   npm run test:phase1                     # 只测试 defaultProvider 的 defaultModel
 *   npm run test:phase1 -- --all            # 测试所有提供商的所有已配置模型
 *   npm run test:phase1 -- ollama           # 测试指定提供商的所有已配置模型
 *   npm run test:phase1 -- ollama:llama3    # 测试指定提供商的指定模型
 *   npm run test:phase1 -- ollama openai    # 测试多个提供商
 */

import { loadConfig } from "../config/index.js";
import type { Config, ModelProviderConfig } from "../config/schema.js";
import { createProviderRegistry, createCallModel } from "../model/index.js";
import { initWorkspace } from "../workspace/index.js";
import type { ModelResponse } from "../model/types.js";

/** 测试目标：提供商 + 模型 */
interface TestTarget {
  readonly provider: string;
  readonly model?: string;
}

/** 测试结果 */
interface TestResult {
  readonly provider: string;
  readonly model: string;
  readonly passed: boolean;
  readonly content: string;
  readonly usage: { promptTokens: number; completionTokens: number };
  readonly error?: string;
}

/** 格式化打印分隔线 */
function divider(title: string): void {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(50)}`);
}

/** 验证响应格式是否符合统一接口 */
function validateResponseFormat(response: ModelResponse): string[] {
  const errors: string[] = [];
  if (typeof response.content !== "string") errors.push("content 不是字符串");
  if (!Array.isArray(response.toolCalls)) errors.push("toolCalls 不是数组");
  if (typeof response.stopReason !== "string") errors.push("stopReason 不是字符串");
  if (typeof response.usage?.promptTokens !== "number") errors.push("usage.promptTokens 缺失");
  if (typeof response.usage?.completionTokens !== "number")
    errors.push("usage.completionTokens 缺失");
  if (typeof response.model !== "string") errors.push("model 不是字符串");
  return errors;
}

/**
 * 展开提供商配置中的 models 列表为测试目标
 * 如果配置了 models，为每个模型生成一个 target；否则只用 defaultModel
 */
function expandProviderModels(
  providerName: string,
  providerConfig: ModelProviderConfig,
): TestTarget[] {
  const models = providerConfig.models;
  if (models && models.length > 0) {
    return models.map((model) => ({
      provider: providerName,
      model: typeof model === "string" ? model : model.id,
    }));
  }
  // 没有 models 列表时，使用 defaultModel（或不指定，由 adapter 决定默认值）
  return [{ provider: providerName, model: providerConfig.defaultModel }];
}

/**
 * 解析命令行参数，确定要测试的目标列表
 *
 * 支持格式：
 *   --all             → 所有提供商 × 所有已配置模型
 *   provider          → 该提供商的所有已配置模型
 *   provider:model    → 该提供商的指定模型
 *   （无参数）         → defaultProvider 的 defaultModel
 */
function resolveTestTargets(args: string[], config: Config): TestTarget[] {
  const providers = config.provider;
  const allNames = Object.keys(providers);

  // --all：所有提供商 × 所有模型
  if (args.includes("--all")) {
    return allNames.flatMap((name) => expandProviderModels(name, providers[name]));
  }

  // 解析具名参数
  const named = args.filter((a) => !a.startsWith("-"));
  if (named.length > 0) {
    return named.flatMap((arg) => {
      const colonIdx = arg.indexOf(":");
      if (colonIdx !== -1) {
        // provider:model 格式
        const provider = arg.slice(0, colonIdx);
        const model = arg.slice(colonIdx + 1);
        return [{ provider, model }];
      }
      // 仅提供商名：展开其所有模型
      const providerConfig = providers[arg];
      if (providerConfig) {
        return expandProviderModels(arg, providerConfig);
      }
      return [{ provider: arg }];
    });
  }

  // 默认：只测试 defaultProvider 的 defaultModel
  return [{ provider: config.agents.default.model.split("/")[0] }];
}

/** 格式化测试目标显示名 */
function targetLabel(target: TestTarget): string {
  return target.model ? `${target.provider}:${target.model}` : target.provider;
}

async function main(): Promise<void> {
  console.log("🐍 Ouroboros 阶段一 · 系统完整性测试\n");

  // 1. 加载配置
  console.log("[1/4] 加载配置...");
  const config = await loadConfig();
  const allProviders = Object.keys(config.provider);
  const args = process.argv.slice(2);
  const targets = resolveTestTargets(args, config);
  console.log(`  已注册提供商: ${allProviders.join(", ")}`);
  console.log(`  本次测试: ${targets.map(targetLabel).join(", ")}`);

  // 2. 初始化 workspace
  console.log("[2/4] 初始化 workspace...");
  await initWorkspace(config.agents.default.workspacePath);
  console.log("  workspace 初始化完成");

  // 3. 创建 callModel
  console.log("[3/4] 创建模型调用接口...");
  const registry = createProviderRegistry(config.provider);
  const callModel = createCallModel(config, registry, config.agents.default.model.split("/")[0]);
  console.log("  callModel 就绪");

  // 4. 逐个测试
  divider("开始测试");
  const prompt = "请回复：你好，Ouroboros";
  const results: TestResult[] = [];

  for (const target of targets) {
    if (!allProviders.includes(target.provider)) {
      console.log(`\n▶ 跳过 ${targetLabel(target)}（未在 config.json 中配置）`);
      continue;
    }

    const label = targetLabel(target);
    console.log(`\n▶ 测试: ${label}`);
    try {
      // 非流式调用
      const response = await callModel(
        {
          messages: [{ role: "user", content: prompt }],
          model: target.model,
          temperature: 0,
          maxTokens: 100,
        },
        { provider: target.provider },
      );

      // 验证格式
      const formatErrors = validateResponseFormat(response);
      // 验证内容包含 Ouroboros
      const containsKeyword = response.content.includes("Ouroboros");

      const passed = formatErrors.length === 0 && containsKeyword;

      results.push({
        provider: target.provider,
        model: response.model,
        passed,
        content: response.content,
        usage: {
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
        },
        error: !containsKeyword
          ? "响应不包含 'Ouroboros'"
          : formatErrors.length > 0
            ? formatErrors.join("; ")
            : undefined,
      });

      console.log(`  模型: ${response.model}`);
      console.log(`  响应: ${response.content}`);
      console.log(`  Token: ${response.usage.promptTokens} + ${response.usage.completionTokens}`);
      console.log(`  结果: ${passed ? "✅ 通过" : "❌ 失败"}`);
      if (!passed && !containsKeyword) console.log(`  原因: 响应不包含 'Ouroboros'`);

      // 流式调用测试
      console.log(`\n▶ 测试 (流式): ${label}`);
      let streamContent = "";
      const streamResponse = await callModel(
        {
          messages: [{ role: "user", content: prompt }],
          model: target.model,
          temperature: 0,
          maxTokens: 100,
        },
        {
          provider: target.provider,
          stream: true,
          onStream: (event) => {
            if (event.type === "text_delta") {
              streamContent += event.text;
            }
          },
        },
      );

      const streamPassed = streamResponse.content.includes("Ouroboros");
      console.log(`  流式结果: ${streamPassed ? "✅ 通过" : "❌ 失败"}`);
      console.log(
        `  流式内容完整性: ${streamContent === streamResponse.content ? "✅ 一致" : "⚠️ 不一致"}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        provider: target.provider,
        model: target.model ?? "N/A",
        passed: false,
        content: "",
        usage: { promptTokens: 0, completionTokens: 0 },
        error: message,
      });
      console.log(`  ❌ 错误: ${message}`);
    }
  }

  // 5. 汇总
  divider("测试汇总");
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    console.log(`  ${icon} ${r.provider}/${r.model}${r.error ? ` — ${r.error}` : ""}`);
  }

  console.log(`\n  总计: ${passed}/${total} 通过`);

  if (results.length >= 2 && passed === total) {
    console.log(
      `  响应格式一致性: ✅ 所有模型返回相同结构 (content, toolCalls, stopReason, usage, model)`,
    );
  }

  console.log();
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error("\n💥 测试执行失败:", err instanceof Error ? err.message : err);
  process.exit(1);
});
