/**
 * 阶段四：ReAct 核心循环与执行树集成测试
 *
 * 验收流程：
 * 1. 加载配置 + 初始化 workspace
 * 2. 创建工具注册表 + 执行器 + Logger
 * 3. 注册测试工具（get-date、write-file）
 * 4. 装配用户级提示词（self 等，core.md 由 runReactLoop 内部加载）
 * 5. 运行 ReAct 循环：
 *    任务: "查询今天的日期，然后把日期写入 workspace/tmp/today.txt 文件中"
 *    工具: [get-date, write-file, call-model, search-tool, create-tool]
 * 6. 验证 ReactResult.steps.length >= 2
 * 7. 验证执行树有 ≥3 个节点（root + ≥2 tool-call）
 * 8. 验证执行树 state === 'completed'
 * 9. 验证 workspace/tmp/today.txt 存在且包含日期
 * 10. 验证 workspace/logs/yyyy-MM-dd.log 存在且有日志
 * 11. 清理
 *
 * 使用方式：
 *   npm run test:phase4
 */

import { readFile, stat, mkdir, writeFile as fsWriteFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../config/index.js";
import { createProviderRegistry, createCallModel } from "../model/index.js";
import { initWorkspace } from "../workspace/index.js";
import {
  createToolRegistry,
  createToolExecutor,
  EntityStatus,
  EntityType,
  type OuroborosTool,
} from "../tool/index.js";
import { assemblePrompt } from "../prompt/assembler.js";
import { loadPromptFile } from "../prompt/loader.js";
import type { RenderedPrompt } from "../prompt/types.js";
import {
  runReactLoop,
  TreeState,
  type ReactLoopConfig,
  type ReactDependencies,
} from "../core/index.js";
import { createLogger } from "../logger/index.js";

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

async function main(): Promise<void> {
  console.log("🐍 Ouroboros 阶段四 · ReAct 核心循环与执行树集成测试\n");

  const checks: Check[] = [];

  // ── 1. 加载配置 + 初始化 workspace ──────────────────────────────
  console.log("[1/11] 加载配置...");
  const config = await loadConfig();
  console.log(`  默认提供商: ${config.agents.default.model.split("/")[0]}`);
  console.log(
    `  ReAct 配置: maxIterations=${config.react.maxIterations}, stepTimeout=${config.react.stepTimeout}ms`,
  );

  console.log("[2/11] 初始化 workspace...");
  await initWorkspace(config.agents.default.workspacePath);
  // 确保 tmp 目录存在
  await mkdir(join(config.agents.default.workspacePath, "tmp"), { recursive: true });
  console.log("  workspace 初始化完成");

  // ── 2. 创建工具注册表 + 执行器 + Logger ─────────────────────────
  console.log("[3/11] 创建工具注册表 + 执行器 + Logger...");
  const providerRegistry = createProviderRegistry(config.providers);
  const callModel = createCallModel(
    config,
    providerRegistry,
    config.agents.default.model.split("/")[0],
  );
  const registry = await createToolRegistry(config.agents.default.workspacePath);
  const executor = createToolExecutor(registry, {
    workspacePath: config.agents.default.workspacePath,
    callModel,
  });
  const logger = createLogger(config.agents.default.workspacePath, config.system.logLevel);
  console.log("  注册表 + 执行器 + Logger 创建完成");

  // ── 3. 注册测试工具（get-date、write-file） ─────────────────────
  console.log("[4/11] 注册测试工具...");

  const now = new Date().toISOString();

  // get-date 工具：通过脚本文件实现
  const getDateScript = `export default async function() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return { date: y + "-" + m + "-" + d };
}`;

  const scriptsDir = join(config.agents.default.workspacePath, "tools", "scripts");
  await mkdir(scriptsDir, { recursive: true });
  await fsWriteFile(join(scriptsDir, "get-date.js"), getDateScript, "utf-8");

  const getDateTool: OuroborosTool = {
    id: "tool:get-date",
    type: EntityType.Tool,
    name: "获取日期",
    description: "获取今天的日期，返回 yyyy-MM-dd 格式",
    tags: ["日期", "时间"],
    version: "1.0.0",
    status: EntityStatus.Active,
    permissions: {},
    origin: "user",
    createdAt: now,
    updatedAt: now,
    entrypoint: "scripts/get-date.js",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: { date: { type: "string", description: "今天的日期 yyyy-MM-dd" } },
    },
  };

  // write-file 工具
  const writeFileScript = `import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

export default async function(input, context) {
  const filePath = join(context.workspacePath, input.path);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, input.content, "utf-8");
  return { success: true, path: filePath };
}`;

  await fsWriteFile(join(scriptsDir, "write-file.js"), writeFileScript, "utf-8");

  const writeFileTool: OuroborosTool = {
    id: "tool:write-file",
    type: EntityType.Tool,
    name: "写入文件",
    description: "将内容写入指定路径的文件",
    tags: ["文件", "写入"],
    version: "1.0.0",
    status: EntityStatus.Active,
    permissions: { filesystem: ["workspace/**"] },
    origin: "user",
    createdAt: now,
    updatedAt: now,
    entrypoint: "scripts/write-file.js",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件路径（相对于 workspace）" },
        content: { type: "string", description: "文件内容" },
      },
      required: ["path", "content"],
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        path: { type: "string" },
      },
    },
  };

  await registry.register(getDateTool);
  await registry.register(writeFileTool);
  console.log(`  已注册工具: ${registry.list().length} 个（含 4 内置 + 2 测试工具）`);
  checks.push({
    name: "测试工具注册",
    passed: registry.has("tool:get-date") && registry.has("tool:write-file"),
  });

  // ── 4. 装配用户级提示词（core.md 由 runReactLoop 内部自动加载）───
  console.log("[5/11] 装配用户级提示词...");
  let contextPrompt = "";
  try {
    const promptFiles = await Promise.all([
      loadPromptFile(config.agents.default.workspacePath, "self").catch(() => null),
    ]);
    const validFiles = promptFiles.filter((f) => f !== null);
    if (validFiles.length > 0) {
      const renderedParts: RenderedPrompt[] = validFiles.map((f) => ({
        fileType: f.metadata.type,
        content: f.content,
      }));
      const assembled = assemblePrompt(renderedParts);
      contextPrompt = assembled.systemPrompt;
    }
  } catch {
    // 用户级提示词加载失败时使用空字符串，core.md 仍由 runReactLoop 保证
  }
  console.log(`  用户级提示词长度: ${contextPrompt.length} 字符`);

  // ── 5. 运行 ReAct 循环 ──────────────────────────────────────────
  console.log("[6/11] 运行 ReAct 循环...");
  const allTools = registry.list();
  const reactConfig: ReactLoopConfig = {
    maxIterations: config.react.maxIterations,
    stepTimeout: config.react.stepTimeout,
    parallelToolCalls: config.react.parallelToolCalls,
    compressionThreshold: config.react.compressionThreshold,
    agentId: "agent:main",
  };
  const deps: ReactDependencies = {
    callModel,
    toolExecutor: executor,
    toolRegistry: registry,
    logger,
    workspacePath: config.agents.default.workspacePath,
  };

  const task =
    "查询今天的日期，然后把日期写入 workspace/tmp/today.txt 文件中。使用 tool:get-date 获取日期，使用 tool:write-file 写入文件（path 使用 'tmp/today.txt'）。";

  const result = await runReactLoop(task, contextPrompt, allTools, reactConfig, deps);

  console.log(`  停止原因: ${result.stopReason}`);
  console.log(`  总迭代: ${result.totalIterations}`);
  console.log(`  总步骤: ${result.steps.length}`);
  console.log(`  总耗时: ${result.totalDuration}ms`);
  console.log(
    `  Token 用量: prompt=${result.totalUsage.promptTokens}, completion=${result.totalUsage.completionTokens}`,
  );
  console.log(`  回答: ${result.answer.slice(0, 200)}`);

  // ── 6. 验证步骤数 ──────────────────────────────────────────────
  console.log("[7/11] 验证步骤数...");
  const stepsOk = result.steps.length >= 2;
  console.log(`  步骤数: ${result.steps.length} (需 >= 2)`);
  console.log(`  ${stepsOk ? "✅" : "❌"} 步骤数检查`);
  checks.push({ name: "步骤数 >= 2", passed: stepsOk });

  // 打印每个步骤的工具调用
  for (const step of result.steps) {
    if (step.toolCalls.length > 0) {
      for (const tc of step.toolCalls) {
        console.log(
          `    步骤 ${step.stepIndex}: ${tc.toolId} → ${tc.success ? "✅" : "❌"} (${tc.duration}ms)`,
        );
      }
    } else {
      console.log(`    步骤 ${step.stepIndex}: 最终回答`);
    }
  }

  // ── 7. 验证执行树节点数 ────────────────────────────────────────
  console.log("[8/11] 验证执行树节点数...");
  const nodeCount = Object.keys(result.executionTree.nodes).length;
  const nodesOk = nodeCount >= 3;
  console.log(`  节点数: ${nodeCount} (需 >= 3)`);
  console.log(`  ${nodesOk ? "✅" : "❌"} 执行树节点数检查`);
  checks.push({ name: "执行树节点 >= 3", passed: nodesOk });

  // ── 8. 验证执行树状态 ──────────────────────────────────────────
  console.log("[9/11] 验证执行树状态...");
  const treeStateOk = result.executionTree.state === TreeState.Completed;
  console.log(`  树状态: ${result.executionTree.state}`);
  console.log(`  ${treeStateOk ? "✅" : "❌"} 执行树状态检查`);
  checks.push({ name: "执行树 state=completed", passed: treeStateOk });

  // ── 9. 验证 workspace/tmp/today.txt ────────────────────────────
  console.log("[10/11] 验证 workspace/tmp/today.txt...");
  const todayPath = join(config.agents.default.workspacePath, "tmp", "today.txt");
  let fileOk = false;
  try {
    const content = await readFile(todayPath, "utf-8");
    // 检查内容是否包含日期格式 yyyy-MM-dd
    fileOk = /\d{4}-\d{2}-\d{2}/.test(content);
    console.log(`  文件内容: "${content.trim()}"`);
    console.log(`  ${fileOk ? "✅" : "❌"} today.txt 包含日期`);
  } catch {
    console.log(`  ❌ today.txt 不存在或读取失败`);
  }
  checks.push({ name: "today.txt 包含日期", passed: fileOk });

  // ── 10. 验证日志文件 ───────────────────────────────────────────
  console.log("[11/11] 验证日志文件...");
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const logPath = join(config.agents.default.workspacePath, "logs", `${dateStr}.log`);

  // 等待一小段时间确保异步日志写入完成
  await new Promise((r) => setTimeout(r, 500));

  let logOk = false;
  try {
    const logStat = await stat(logPath);
    logOk = logStat.size > 0;
    console.log(`  日志文件: ${logPath} (${logStat.size} bytes)`);
    console.log(`  ${logOk ? "✅" : "❌"} 日志文件存在且不为空`);
  } catch {
    console.log(`  ❌ 日志文件 ${logPath} 不存在`);
  }
  checks.push({ name: "日志文件存在", passed: logOk });

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
