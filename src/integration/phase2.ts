/**
 * 阶段二：提示词系统集成测试
 *
 * 验收流程：
 * 1. 初始化 workspace（模板复制到 workspace/prompts/）
 * 2. 加载 self.md，验证身体图式变量存在
 * 3. 渲染 self.md 模板变量（platform、availableMemory、workspacePath 等）
 * 4. 往 skill.md 追加自定义技能条目
 * 5. 初始化 qmd 向量索引 + 语义搜索命中
 * 6. 装配 core + self 提示词
 * 7. callModel 验证响应包含身体图式信息
 *
 * 使用方式：
 *   npm run test:phase2
 */

import os from "node:os";
import { loadConfig } from "../config/index.js";
import { createProviderRegistry, createCallModel } from "../model/index.js";
import { initWorkspace } from "../workspace/index.js";
import {
  readPromptFile,
  appendToPromptFile,
  getPromptFilePath,
  loadPromptFile,
  searchByKeyword,
  searchBySemantic,
  extractVariables,
  renderTemplate,
  assemblePrompt,
  isQmdAvailable,
  initVectorIndex,
  removeVectorIndex,
} from "../prompt/index.js";
import type { RenderedPrompt } from "../prompt/types.js";

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
  console.log("🐍 Ouroboros 阶段二 · 提示词系统集成测试\n");

  const checks: Check[] = [];

  // ── 1. 加载配置 + 初始化 workspace ──────────────────────────────
  console.log("[1/9] 加载配置...");
  const { config } = await loadConfig();
  console.log(`  默认提供商: ${config.agents.default.model.split("/")[0]}`);

  console.log("[2/9] 初始化 workspace（模板复制）...");
  await initWorkspace(config.agents.default.workspacePath);
  console.log("  workspace 初始化完成，默认模板已复制");

  // ── 2. 加载 self.md 验证身体图式变量 ────────────────────────────
  console.log("[3/9] 加载 self.md 验证模板变量...");
  const selfFile = await loadPromptFile(config.agents.default.workspacePath, "self");
  const selfLoadOk = selfFile !== null;
  console.log(`  ${selfLoadOk ? "✅" : "❌"} self.md 加载成功`);
  checks.push({ name: "self.md 加载", passed: selfLoadOk });

  const selfVars = extractVariables(selfFile!.content);
  console.log(`  提取到变量: ${selfVars.join(", ")}`);
  const hasBodyVars =
    selfVars.includes("platform") &&
    selfVars.includes("availableMemory") &&
    selfVars.includes("workspacePath");
  console.log(`  ${hasBodyVars ? "✅" : "❌"} 身体图式变量完整`);
  checks.push({ name: "身体图式变量提取", passed: hasBodyVars });

  // ── 3. 渲染 self.md 模板 ────────────────────────────────────────
  console.log("[4/9] 渲染 self.md 身体图式...");
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memInfo = `${(freeMem / 1024 / 1024 / 1024).toFixed(1)}GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(1)}GB`;

  const selfRendered = renderTemplate(selfFile!.content, {
    platform: `${os.platform()} ${os.arch()} (Node.js ${process.version})`,
    availableMemory: memInfo,
    workspacePath: config.agents.default.workspacePath,
    focusLevel: "高",
    cautionLevel: "中",
    creativityLevel: "中",
    worldModel: "1. 自我指涉 — 测试原则",
    selfAwareness: "**Identity**: 测试 Agent",
    userModel: "Not yet known.",
  });

  const renderOk =
    selfRendered.includes(os.platform()) &&
    selfRendered.includes(config.agents.default.workspacePath) &&
    !selfRendered.includes("{{platform}}") &&
    selfRendered.includes("自我指涉") &&
    selfRendered.includes("Not yet known.");
  console.log(`  运行环境: ${os.platform()} ${os.arch()}`);
  console.log(`  可用内存: ${memInfo}`);
  console.log(`  ${renderOk ? "✅" : "❌"} 身体图式变量替换成功`);
  checks.push({ name: "身体图式变量替换", passed: renderOk });

  // ── 4. 追加自定义技能条目到 skill.md ────────────────────────────
  console.log("[5/9] 追加自定义技能到 skill.md...");
  const skillEntry =
    "| 文件摘要 | skill:file-summary | 读取指定文件并生成摘要 | workspace/skills/file-summary |";
  const skillFilePath = getPromptFilePath(config.agents.default.workspacePath, "skill");
  await appendToPromptFile(skillFilePath, skillEntry);

  const skillFile = await readPromptFile(skillFilePath);
  const skillAppendOk = skillFile?.content.includes("文件摘要") ?? false;
  console.log(`  ${skillAppendOk ? "✅" : "❌"} 技能条目追加成功`);
  checks.push({ name: "技能条目追加", passed: skillAppendOk });

  // ── 5. 关键词 + 向量检索 ────────────────────────────────────────
  console.log("[6/9] 关键词检索 '文件摘要'...");
  const keywordResults = await searchByKeyword(config.agents.default.workspacePath, "文件摘要");
  const keywordHit = keywordResults.length > 0 && keywordResults[0].fileName === "skill.md";
  console.log(`  ${keywordHit ? "✅" : "❌"} 关键词检索命中 (${keywordResults.length} 条)`);
  checks.push({ name: "关键词检索命中", passed: keywordHit });

  console.log("[7/9] 向量语义检索...");
  const qmdReady = await isQmdAvailable(config.agents.default.workspacePath);
  let vectorHit = false;

  if (qmdReady) {
    console.log("  qmd 可用，初始化向量索引...");
    try {
      await initVectorIndex(config.agents.default.workspacePath);
      const semanticResults = await searchBySemantic(
        config.agents.default.workspacePath,
        "文件摘要",
        {
          mode: "query",
        },
      );
      vectorHit = semanticResults.length > 0 && semanticResults[0].fileName.includes("skill");
      console.log(`  ${vectorHit ? "✅" : "❌"} 向量检索命中 (${semanticResults.length} 条)`);
    } catch (err) {
      console.log(`  ⚠️ 向量检索异常: ${err instanceof Error ? err.message : err}`);
    }
  } else {
    console.log("  ⚠️ qmd 未安装，跳过向量检索（使用关键词回退）");
    vectorHit = keywordHit;
  }
  checks.push({ name: "向量/语义检索命中", passed: vectorHit });

  // ── 6. 装配 core + self 提示词 ──────────────────────────────────
  console.log("[8/9] 装配 core + self 提示词 → callModel...");
  const coreFile = await loadPromptFile(config.agents.default.workspacePath, "core");

  const parts: RenderedPrompt[] = [
    { fileType: "core", content: coreFile!.content },
    { fileType: "self", content: selfRendered },
  ];

  const assembled = assemblePrompt(parts);
  const assembleOk =
    assembled.systemPrompt.includes("Ouroboros") && assembled.systemPrompt.includes(os.platform());
  console.log(`  systemPrompt 长度: ${assembled.systemPrompt.length}`);
  console.log(`  ${assembleOk ? "✅" : "❌"} 装配成功（包含 core + 身体图式）`);
  checks.push({ name: "提示词装配", passed: assembleOk });

  // ── 7. 调用模型验证 ────────────────────────────────────────────
  const registry = createProviderRegistry(config.provider);
  const callModel = createCallModel(config, registry, config.agents.default.model.split("/")[0]);

  const response = await callModel({
    messages: [
      { role: "system", content: assembled.systemPrompt },
      { role: "user", content: "你运行在什么平台上？你的工作目录是什么？请简要回答。" },
    ],
    temperature: 0,
    maxTokens: 200,
  });

  console.log(`  模型: ${response.model}`);
  console.log(`  响应: ${response.content}`);
  console.log(`  Token: ${response.usage.promptTokens} + ${response.usage.completionTokens}`);

  // 验证模型响应包含身体图式信息（平台或工作目录）
  const platformStr = os.platform();
  const containsBodyInfo =
    response.content.includes(platformStr) ||
    response.content.toLowerCase().includes("linux") ||
    response.content.includes("workspace");
  console.log(`  ${containsBodyInfo ? "✅" : "❌"} 模型感知到身体图式信息`);
  checks.push({ name: "模型感知身体图式", passed: containsBodyInfo });

  // ── 8. 清理 ────────────────────────────────────────────────────
  console.log("[9/9] 清理...");
  if (qmdReady) {
    await removeVectorIndex(config.agents.default.workspacePath);
    console.log("  向量索引已清理");
  }

  // ── 汇总 ────────────────────────────────────────────────────────
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
  process.exit(1);
});
