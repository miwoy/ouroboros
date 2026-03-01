/**
 * 阶段二：提示词系统集成测试
 *
 * 验证目标：
 * 创建一个包含 {{userName}} 变量的提示词模板，存入 workspace/prompts。
 * 通过检索 "用户问候" 定位到该模板，动态装配后传入 callModel，
 * 验证模型收到的提示词中 {{userName}} 已被替换为实际值，且模型返回个性化问候。
 *
 * 使用方式：
 *   npm run test:phase2
 */

import { loadConfig } from "../config/index.js";
import { createProviderRegistry, createCallModel } from "../model/index.js";
import { initWorkspace } from "../workspace/index.js";
import {
  savePromptTemplate,
  searchByKeyword,
  renderTemplate,
  assemblePrompt,
} from "../prompt/index.js";
import type { PromptTemplate, RenderedPrompt } from "../prompt/types.js";

/** 格式化打印分隔线 */
function divider(title: string): void {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(50)}`);
}

async function main(): Promise<void> {
  console.log("🐍 Ouroboros 阶段二 · 提示词系统集成测试\n");

  // 1. 加载配置 + 初始化 workspace
  console.log("[1/7] 加载配置...");
  const config = await loadConfig();
  console.log(`  默认提供商: ${config.model.defaultProvider}`);

  console.log("[2/7] 初始化 workspace...");
  await initWorkspace(config.system.workspacePath);
  console.log("  workspace 初始化完成");

  // 2. 创建并保存提示词模板
  console.log("[3/7] 创建提示词模板...");
  const greetingTemplate: PromptTemplate = {
    id: "skill:greeting",
    category: "skill",
    name: "用户问候",
    description: "用友好的方式问候用户，支持个性化称呼",
    content:
      "你好 {{userName}}，请用友好的方式问候用户。回复中必须包含用户的名字。",
    variables: [
      { name: "userName", description: "用户名", required: true },
    ],
    tags: ["问候", "用户", "欢迎"],
    version: "1.0.0",
  };

  await savePromptTemplate(config.system.workspacePath, greetingTemplate);
  console.log(`  已保存模板: ${greetingTemplate.id}`);

  // 3. 关键词检索
  console.log("[4/7] 关键词检索 '用户问候'...");
  const searchResults = await searchByKeyword(
    config.system.workspacePath,
    "用户问候",
  );

  if (searchResults.length === 0) {
    console.error("  ❌ 未找到匹配模板");
    process.exit(1);
  }

  const found = searchResults[0];
  console.log(`  命中模板: ${found.template.id} (分数: ${found.score})`);

  if (found.template.id !== "skill:greeting") {
    console.error(`  ❌ 预期命中 skill:greeting，实际命中 ${found.template.id}`);
    process.exit(1);
  }
  console.log("  ✅ 检索命中正确");

  // 4. 渲染模板
  console.log("[5/7] 渲染模板...");
  const rendered = renderTemplate(
    found.template.content,
    { userName: "张三" },
    found.template.variables,
  );
  console.log(`  渲染结果: ${rendered}`);

  if (!rendered.includes("张三")) {
    console.error("  ❌ 变量替换失败");
    process.exit(1);
  }
  console.log("  ✅ 变量替换成功");

  // 5. 装配提示词
  console.log("[6/7] 装配提示词...");
  const renderedPrompt: RenderedPrompt = {
    templateId: found.template.id,
    content: rendered,
    category: found.template.category,
  };

  const assembled = assemblePrompt([renderedPrompt]);
  console.log(`  systemPrompt: ${assembled.systemPrompt}`);

  if (!assembled.systemPrompt.includes("张三")) {
    console.error("  ❌ 装配结果中不包含变量值");
    process.exit(1);
  }
  console.log("  ✅ 装配成功");

  // 6. 调用模型验证
  console.log("[7/7] 调用模型验证...");
  const registry = createProviderRegistry(config.model.providers);
  const callModel = createCallModel(config, registry);

  const response = await callModel({
    messages: [
      { role: "system", content: assembled.systemPrompt },
      { role: "user", content: "请问候我" },
    ],
    temperature: 0,
    maxTokens: 200,
  });

  console.log(`  模型: ${response.model}`);
  console.log(`  响应: ${response.content}`);
  console.log(
    `  Token: ${response.usage.promptTokens} + ${response.usage.completionTokens}`,
  );

  const containsName = response.content.includes("张三");
  console.log(`  包含 "张三": ${containsName ? "✅ 是" : "❌ 否"}`);

  // 汇总
  divider("测试汇总");
  const checks = [
    { name: "关键词检索命中", passed: found.template.id === "skill:greeting" },
    { name: "模板变量替换", passed: rendered.includes("张三") },
    { name: "提示词装配", passed: assembled.systemPrompt.includes("张三") },
    { name: "模型个性化响应", passed: containsName },
  ];

  let allPassed = true;
  for (const check of checks) {
    const icon = check.passed ? "✅" : "❌";
    console.log(`  ${icon} ${check.name}`);
    if (!check.passed) allPassed = false;
  }

  console.log(`\n  总计: ${checks.filter((c) => c.passed).length}/${checks.length} 通过`);
  console.log();

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("\n💥 测试执行失败:", err instanceof Error ? err.message : err);
  process.exit(1);
});
