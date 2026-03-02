/**
 * 阶段三：一级工具系统集成测试
 *
 * 验收流程：
 * 1. 加载配置 + 初始化 workspace
 * 2. 创建工具注册表 + 工具执行器
 * 3. 验证 4 个内置工具已注册
 * 4. tool:call-model — 调用模型验证响应
 * 5. tool:search-tool("数学计算") → 预期 0 结果
 * 6. 调用 callModel 生成加法计算器代码
 * 7. tool:create-tool → 注册 "加法计算器" 工具
 * 8. tool:search-tool("数学计算") → 预期命中
 * 9. 执行加法计算器 { a: 3, b: 7 } → 预期 { result: 10 }
 * 10. 验证 registry.json 和 tool.md 包含新工具
 * 11. 清理
 *
 * 使用方式：
 *   npm run test:phase3
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../config/index.js";
import { createProviderRegistry, createCallModel } from "../model/index.js";
import { initWorkspace } from "../workspace/index.js";
import { createToolRegistry, createToolExecutor, type ToolCallRequest, type ToolRegistryData } from "../tool/index.js";
import { removeVectorIndex } from "../prompt/vector.js";

/** 格式化打印分隔线 */
function divider(title: string): void {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(50)}`);
}

/** 测试检查项 */
interface Check {
  readonly name: string;
  readonly passed: boolean;
}

/** 生成请求 ID */
let reqCounter = 0;
function nextReqId(): string {
  return `phase3-req-${++reqCounter}`;
}

async function main(): Promise<void> {
  console.log("🐍 Ouroboros 阶段三 · 一级工具系统集成测试\n");

  const checks: Check[] = [];

  // ── 1. 加载配置 + 初始化 workspace ──────────────────────────────
  console.log("[1/11] 加载配置...");
  const config = await loadConfig();
  console.log(`  默认提供商: ${config.model.defaultProvider}`);
  console.log(`  工具超时: ${config.tools.defaultTimeout}ms`);

  console.log("[2/11] 初始化 workspace...");
  await initWorkspace(config.system.workspacePath);
  console.log("  workspace 初始化完成");

  // ── 2. 创建工具注册表 + 执行器 ──────────────────────────────────
  console.log("[3/11] 创建工具注册表 + 执行器...");
  const providerRegistry = createProviderRegistry(config.model.providers);
  const callModel = createCallModel(config, providerRegistry);
  const registry = await createToolRegistry(config.system.workspacePath);
  const executor = createToolExecutor(registry, {
    workspacePath: config.system.workspacePath,
    callModel,
  });

  // ── 3. 验证 4 个内置工具已注册 ──────────────────────────────────
  const allTools = registry.list();
  const builtinIds = ["tool:call-model", "tool:run-agent", "tool:search-tool", "tool:create-tool"];
  const allRegistered = builtinIds.every((id) => registry.has(id));
  console.log(`  已注册工具: ${allTools.length} 个`);
  console.log(`  ${allRegistered ? "✅" : "❌"} 4 个内置工具全部注册`);
  checks.push({ name: "内置工具注册", passed: allRegistered });

  // ── 4. tool:call-model 调用模型 ─────────────────────────────────
  console.log("[4/11] tool:call-model — 调用模型...");
  const callModelReq: ToolCallRequest = {
    requestId: nextReqId(),
    toolId: "tool:call-model",
    input: {
      messages: [
        { role: "user", content: "请回复：你好，Ouroboros 工具系统" },
      ],
      temperature: 0,
      maxTokens: 100,
    },
    caller: { entityId: "agent:core" },
  };
  const callModelRes = await executor.execute(callModelReq);
  const callModelOk = callModelRes.success && typeof callModelRes.output?.content === "string";
  console.log(`  成功: ${callModelRes.success}`);
  if (callModelRes.output) {
    console.log(`  响应: ${String(callModelRes.output.content).slice(0, 100)}`);
    console.log(`  耗时: ${callModelRes.duration}ms`);
  }
  if (callModelRes.error) {
    console.log(`  错误: ${callModelRes.error.message}`);
  }
  console.log(`  ${callModelOk ? "✅" : "❌"} call-model 执行成功`);
  checks.push({ name: "call-model 调用", passed: callModelOk });

  // ── 5. tool:search-tool("数学计算") → 预期 0 结果 ──────────────
  console.log('[5/11] tool:search-tool("数学计算") — 预期未命中...');
  const searchReq1: ToolCallRequest = {
    requestId: nextReqId(),
    toolId: "tool:search-tool",
    input: { query: "数学计算", limit: 5 },
    caller: { entityId: "agent:core" },
  };
  const searchRes1 = await executor.execute(searchReq1);
  const searchOutput1 = searchRes1.output as { tools: readonly { id: string }[]; total: number } | undefined;
  // 排除内置工具的匹配，只看自定义工具
  const customHits1 = searchOutput1?.tools.filter((t) => !t.id.startsWith("tool:call-") && !t.id.startsWith("tool:run-") && !t.id.startsWith("tool:search-") && !t.id.startsWith("tool:create-")) ?? [];
  const noCustomHit = customHits1.length === 0;
  console.log(`  搜索结果: ${searchOutput1?.total ?? 0} 条（自定义工具: ${customHits1.length} 条）`);
  console.log(`  ${noCustomHit ? "✅" : "❌"} 自定义工具未命中（正确）`);
  checks.push({ name: "搜索无自定义工具", passed: noCustomHit });

  // ── 6. 调用 callModel 生成加法计算器代码 ────────────────────────
  console.log("[6/11] 调用 callModel 生成加法计算器代码...");
  const codeGenRes = await callModel({
    messages: [
      {
        role: "system",
        content: "你是代码生成器。只输出纯 JavaScript ES Module 代码，不要 markdown 标记或解释。",
      },
      {
        role: "user",
        content: `生成一个 ES Module JavaScript 函数，要求：
1. export default async function(input, context)
2. input 包含 a 和 b 两个数字
3. 返回 { result: a + b }
4. 只输出代码，不要其他内容`,
      },
    ],
    temperature: 0,
    maxTokens: 200,
  });

  // 从响应中提取代码
  let generatedCode = codeGenRes.content.trim();
  // 去除 markdown 代码块标记
  if (generatedCode.startsWith("```")) {
    generatedCode = generatedCode.replace(/^```(?:javascript|js)?\n?/, "").replace(/\n?```$/, "");
  }
  console.log(`  生成的代码:\n${generatedCode.split("\n").map((l) => `    ${l}`).join("\n")}`);

  // 如果模型生成的代码不合格，使用备用代码
  if (!generatedCode.includes("export default")) {
    console.log("  ⚠️ 模型生成代码不合格，使用备用代码");
    generatedCode = "export default async function(input) {\n  return { result: input.a + input.b };\n}";
  }

  // ── 7. tool:create-tool → 注册加法计算器 ────────────────────────
  console.log("[7/11] tool:create-tool — 注册加法计算器...");
  const createReq: ToolCallRequest = {
    requestId: nextReqId(),
    toolId: "tool:create-tool",
    input: {
      name: "加法计算器",
      description: "计算两个数字的和，支持数学计算",
      inputSchema: {
        type: "object",
        properties: {
          a: { type: "number", description: "第一个数字" },
          b: { type: "number", description: "第二个数字" },
        },
        required: ["a", "b"],
      },
      outputSchema: {
        type: "object",
        properties: {
          result: { type: "number", description: "计算结果" },
        },
      },
      code: generatedCode,
      tags: ["数学", "计算", "加法"],
    },
    caller: { entityId: "agent:core" },
  };
  const createRes = await executor.execute(createReq);
  const createOk = createRes.success && typeof createRes.output?.toolId === "string";
  console.log(`  成功: ${createRes.success}`);
  if (createRes.output) {
    console.log(`  工具 ID: ${createRes.output.toolId}`);
    console.log(`  入口: ${createRes.output.entrypoint}`);
    console.log(`  代码哈希: ${String(createRes.output.codeHash).slice(0, 16)}...`);
  }
  if (createRes.error) {
    console.log(`  错误: ${createRes.error.message}`);
  }
  console.log(`  ${createOk ? "✅" : "❌"} 工具创建成功`);
  checks.push({ name: "create-tool 创建", passed: createOk });

  // ── 8. tool:search-tool("数学计算") → 预期命中 ─────────────────
  console.log('[8/11] tool:search-tool("数学计算") — 预期命中...');
  const searchReq2: ToolCallRequest = {
    requestId: nextReqId(),
    toolId: "tool:search-tool",
    input: { query: "数学计算", limit: 5 },
    caller: { entityId: "agent:core" },
  };
  const searchRes2 = await executor.execute(searchReq2);
  const searchOutput2 = searchRes2.output as { tools: readonly { id: string }[]; total: number } | undefined;
  const hitCalc = searchOutput2?.tools.some((t) => t.id.includes("加法") || t.id.includes("calc")) ?? false;
  console.log(`  搜索结果: ${searchOutput2?.total ?? 0} 条`);
  if (searchOutput2?.tools) {
    for (const t of searchOutput2.tools) {
      console.log(`    - ${t.id}`);
    }
  }
  console.log(`  ${hitCalc ? "✅" : "❌"} 加法计算器工具命中`);
  checks.push({ name: "搜索命中新工具", passed: hitCalc });

  // ── 9. 执行加法计算器 { a: 3, b: 7 } → 预期 { result: 10 } ────
  console.log("[9/11] 执行加法计算器 { a: 3, b: 7 }...");
  const calcToolId = createRes.output?.toolId as string;
  if (calcToolId && registry.has(calcToolId)) {
    const calcReq: ToolCallRequest = {
      requestId: nextReqId(),
      toolId: calcToolId,
      input: { a: 3, b: 7 },
      caller: { entityId: "agent:core" },
    };
    const calcRes = await executor.execute(calcReq);
    const calcOk = calcRes.success && (calcRes.output as { result: number })?.result === 10;
    console.log(`  成功: ${calcRes.success}`);
    console.log(`  输出: ${JSON.stringify(calcRes.output)}`);
    console.log(`  ${calcOk ? "✅" : "❌"} 计算结果正确 (3 + 7 = 10)`);
    checks.push({ name: "加法计算器执行", passed: calcOk });
  } else {
    console.log("  ⚠️ 加法计算器未注册，跳过执行");
    checks.push({ name: "加法计算器执行", passed: false });
  }

  // ── 10. 验证 registry.json 和 tool.md ──────────────────────────
  console.log("[10/11] 验证 registry.json 和 tool.md...");
  let registryOk = false;
  let toolMdOk = false;

  try {
    const registryPath = join(config.system.workspacePath, "tools", "registry.json");
    const registryContent = await readFile(registryPath, "utf-8");
    const registryData = JSON.parse(registryContent) as ToolRegistryData;
    registryOk = registryData.tools.some((t) => t.id.includes("加法") || t.id.includes("calc"));
    console.log(`  registry.json: ${registryData.tools.length} 个自定义工具`);
    console.log(`  ${registryOk ? "✅" : "❌"} registry.json 包含新工具`);
  } catch (err) {
    console.log(`  ❌ 读取 registry.json 失败: ${err instanceof Error ? err.message : err}`);
  }

  try {
    const toolMdPath = join(config.system.workspacePath, "prompts", "tool.md");
    const toolMdContent = await readFile(toolMdPath, "utf-8");
    toolMdOk = toolMdContent.includes("加法计算器") || toolMdContent.includes("calc");
    console.log(`  ${toolMdOk ? "✅" : "❌"} tool.md 包含新工具条目`);
  } catch (err) {
    console.log(`  ❌ 读取 tool.md 失败: ${err instanceof Error ? err.message : err}`);
  }

  checks.push({ name: "registry.json 持久化", passed: registryOk });
  checks.push({ name: "tool.md 追加条目", passed: toolMdOk });

  // ── 11. 清理 ───────────────────────────────────────────────────
  console.log("[11/11] 清理...");
  try {
    await removeVectorIndex(config.system.workspacePath);
    console.log("  向量索引已清理");
  } catch {
    // 忽略
  }

  // ── 汇总 ──────────────────────────────────────────────────────
  divider("测试汇总");
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
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
