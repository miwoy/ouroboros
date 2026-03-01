/**
 * 阶段一：系统完整性测试
 *
 * 验证目标：
 * 使用 callModel 接口调用模型提供商，发送 "请回复：你好，Ouroboros"，
 * 验证返回包含 "Ouroboros" 的文本响应，且响应格式正确。
 *
 * 使用方式：
 *   npm run test:phase1              # 只测试 defaultProvider
 *   npm run test:phase1 -- --all     # 测试所有已配置的提供商
 *   npm run test:phase1 -- ollama    # 测试指定提供商
 */

import { loadConfig } from "../config/index.js";
import { createProviderRegistry, createCallModel } from "../model/index.js";
import { initWorkspace } from "../workspace/index.js";
import type { ModelResponse } from "../model/types.js";

/** 测试结果 */
interface TestResult {
  readonly provider: string;
  readonly passed: boolean;
  readonly content: string;
  readonly model: string;
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

/** 解析命令行参数，确定要测试的提供商列表 */
function resolveTargetProviders(
  args: string[],
  allProviders: string[],
  defaultProvider: string,
): string[] {
  // --all 测试所有提供商
  if (args.includes("--all")) {
    return allProviders;
  }
  // 指定了具体名称
  const named = args.filter((a) => !a.startsWith("-"));
  if (named.length > 0) {
    return named;
  }
  // 默认只测试 defaultProvider
  return [defaultProvider];
}

async function main(): Promise<void> {
  console.log("🐍 Ouroboros 阶段一 · 系统完整性测试\n");

  // 1. 加载配置
  console.log("[1/4] 加载配置...");
  const config = await loadConfig();
  const allProviders = Object.keys(config.model.providers);
  const args = process.argv.slice(2);
  const targetProviders = resolveTargetProviders(args, allProviders, config.model.defaultProvider);
  console.log(`  已注册提供商: ${allProviders.join(", ")}`);
  console.log(`  本次测试: ${targetProviders.join(", ")}`);

  // 2. 初始化 workspace
  console.log("[2/4] 初始化 workspace...");
  await initWorkspace(config.system.workspacePath);
  console.log("  workspace 初始化完成");

  // 3. 创建 callModel
  console.log("[3/4] 创建模型调用接口...");
  const registry = createProviderRegistry(config.model.providers);
  const callModel = createCallModel(config, registry);
  console.log("  callModel 就绪");

  // 4. 逐个测试指定提供商
  divider("开始测试");
  const prompt = "请回复：你好，Ouroboros";
  const results: TestResult[] = [];

  for (const name of targetProviders) {
    if (!allProviders.includes(name)) {
      console.log(`\n▶ 跳过 ${name}（未在 config.json 中配置）`);
      continue;
    }

    console.log(`\n▶ 测试提供商: ${name}`);
    try {
      // 非流式调用
      const response = await callModel(
        {
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          maxTokens: 100,
        },
        { provider: name },
      );

      // 验证格式
      const formatErrors = validateResponseFormat(response);
      // 验证内容包含 Ouroboros
      const containsKeyword = response.content.includes("Ouroboros");

      const passed = formatErrors.length === 0 && containsKeyword;

      results.push({
        provider: name,
        passed,
        content: response.content,
        model: response.model,
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
      console.log(
        `  Token: ${response.usage.promptTokens} + ${response.usage.completionTokens}`,
      );
      console.log(`  结果: ${passed ? "✅ 通过" : "❌ 失败"}`);
      if (!passed && !containsKeyword) console.log(`  原因: 响应不包含 'Ouroboros'`);

      // 流式调用测试
      console.log(`\n▶ 测试提供商 (流式): ${name}`);
      let streamContent = "";
      const streamResponse = await callModel(
        {
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          maxTokens: 100,
        },
        {
          provider: name,
          stream: true,
          onStream: (event) => {
            if (event.type === "text_delta") {
              streamContent += event.text;
              process.stdout.write(event.text);
            }
          },
        },
      );
      console.log(); // 换行

      const streamPassed = streamResponse.content.includes("Ouroboros");
      console.log(`  流式结果: ${streamPassed ? "✅ 通过" : "❌ 失败"}`);
      console.log(
        `  流式内容完整性: ${streamContent === streamResponse.content ? "✅ 一致" : "⚠️ 不一致"}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        provider: name,
        passed: false,
        content: "",
        model: "N/A",
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
    console.log(`  ${icon} ${r.provider} (${r.model})${r.error ? ` — ${r.error}` : ""}`);
  }

  console.log(`\n  总计: ${passed}/${total} 通过`);

  if (results.length >= 2 && passed === total) {
    console.log(
      `  响应格式一致性: ✅ 所有提供商返回相同结构 (content, toolCalls, stopReason, usage, model)`,
    );
  }

  console.log();
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error("\n💥 测试执行失败:", err instanceof Error ? err.message : err);
  process.exit(1);
});
