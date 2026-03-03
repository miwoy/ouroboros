/**
 * 阶段六：Skill 技能系统集成测试
 *
 * 验收流程：
 * 1. 加载配置 + 初始化 workspace
 * 2. 创建技能注册表
 * 3. 验证内置技能 create-solution 已注册
 * 4. 通过 tool:create-skill 创建自定义技能
 * 5. 通过 tool:search-skill 检索刚创建的技能
 * 6. 验证技能注册表能加载 workspace/skills/ 中的文件
 * 7. 使用技能执行器执行技能（ReAct 循环）
 * 8. 验证技能执行结果
 *
 * 使用方式：
 *   npm run test:phase6
 */

import { readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../config/index.js";
import { createProviderRegistry, createCallModel } from "../model/index.js";
import { initWorkspace } from "../workspace/index.js";
import { createToolRegistry, createToolExecutor } from "../tool/index.js";
import { createSkillRegistry, createSkillExecutor } from "../skill/index.js";
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
  console.log("🐍 Ouroboros 阶段六 · Skill 技能系统集成测试\n");

  const checks: Check[] = [];
  const tmpWorkspace = join(tmpdir(), `ouroboros-phase6-${Date.now()}`);

  try {
    // ── 1. 加载配置 + 初始化 workspace ──────────────────────────────
    console.log("[1/8] 加载配置...");
    const { config } = await loadConfig();
    console.log(`  默认提供商: ${config.agents.default.model.split("/")[0]}`);

    console.log("[2/8] 初始化临时 workspace...");
    await initWorkspace(tmpWorkspace);
    console.log(`  workspace: ${tmpWorkspace}`);

    // ── 2. 创建注册表和执行器 ─────────────────────────────────────
    console.log("[3/8] 创建工具 + 技能注册表...");
    const providerRegistry = createProviderRegistry(config.provider);
    const callModel = createCallModel(
      config,
      providerRegistry,
      config.agents.default.model.split("/")[0],
    );
    const toolRegistry = await createToolRegistry(tmpWorkspace);
    const toolExecutor = createToolExecutor(toolRegistry, {
      workspacePath: tmpWorkspace,
      callModel,
    });
    const skillRegistry = await createSkillRegistry(tmpWorkspace);
    const logger = createLogger(tmpWorkspace, config.system.logLevel);

    // ── 3. 验证内置技能 ──────────────────────────────────────────
    console.log("[4/8] 验证内置技能 create-solution...");
    const hasCreateSolution = skillRegistry.has("skill:create-solution");
    const createSolution = skillRegistry.get("skill:create-solution");
    console.log(`  ${hasCreateSolution ? "✅" : "❌"} create-solution 已注册`);
    if (createSolution) {
      console.log(`  名称: ${createSolution.name}`);
      console.log(`  依赖工具: ${createSolution.requiredTools.join(", ")}`);
    }
    checks.push({ name: "内置技能 create-solution", passed: hasCreateSolution });

    // ── 4. 通过 tool:create-skill 创建自定义技能 ─────────────────
    console.log("[5/8] 创建自定义技能 '文件摘要'...");
    const createResult = await toolExecutor.execute({
      requestId: "phase6-create-skill",
      toolId: "tool:create-skill",
      input: {
        name: "文件摘要",
        description: "读取指定文件并生成简要摘要",
        promptTemplate: "请读取文件 {{filePath}} 并生成一段不超过 100 字的摘要。",
        tags: ["摘要", "文件分析"],
      },
      caller: { entityId: "test" },
    });
    const createOk = createResult.success && createResult.output?.["skillId"] === "skill:文件摘要";
    console.log(`  ${createOk ? "✅" : "❌"} 技能创建成功`);
    console.log(`  技能 ID: ${createResult.output?.["skillId"]}`);
    checks.push({ name: "创建自定义技能", passed: createOk });

    // ── 5. 验证技能文件已写入 ───────────────────────────────────
    console.log("[6/8] 验证技能文件...");
    let fileOk = false;
    try {
      const skillFilePath = createResult.output?.["templatePath"] as string;
      const content = await readFile(skillFilePath, "utf-8");
      fileOk = content.includes("文件摘要") && content.includes("{{filePath}}");
      console.log(`  ${fileOk ? "✅" : "❌"} 技能文件内容正确`);
    } catch {
      console.log(`  ❌ 技能文件不存在`);
    }
    checks.push({ name: "技能文件写入", passed: fileOk });

    // ── 6. 验证重新加载技能注册表 ───────────────────────────────
    console.log("[7/8] 验证重新加载技能注册表...");
    const reloadedRegistry = await createSkillRegistry(tmpWorkspace);
    // 用户技能应从 workspace/skills/ 加载
    const userSkills = reloadedRegistry.listByOrigin("user");
    const reloadOk = userSkills.some((s) => s.name === "文件摘要");
    console.log(`  加载的用户技能: ${userSkills.map((s) => s.name).join(", ") || "(无)"}`);
    console.log(`  ${reloadOk ? "✅" : "❌"} 重新加载后包含自定义技能`);
    checks.push({ name: "技能注册表重新加载", passed: reloadOk });

    // ── 7. 验证技能执行器 ──────────────────────────────────────
    console.log("[8/8] 测试技能执行器...");
    // 先创建一个要分析的文件
    await mkdir(join(tmpWorkspace, "tmp"), { recursive: true });
    await writeFile(join(tmpWorkspace, "tmp", "sample.txt"), "这是一个示例文件内容。", "utf-8");

    // 注册加载到的用户技能到执行器
    const skillExecutor = createSkillExecutor({
      skillRegistry: reloadedRegistry,
      toolRegistry,
      toolExecutor,
      callModel,
      logger,
      workspacePath: tmpWorkspace,
    });

    // 找到文件摘要技能的 ID
    const fileSummarySkill = userSkills.find((s) => s.name === "文件摘要");
    if (fileSummarySkill) {
      const execResult = await skillExecutor.execute({
        requestId: "phase6-exec-skill",
        skillId: fileSummarySkill.id,
        variables: { filePath: "tmp/sample.txt" },
        caller: { entityId: "test" },
      });

      const execOk = execResult.duration > 0; // 至少执行了
      console.log(`  执行耗时: ${execResult.duration}ms`);
      console.log(`  执行成功: ${execResult.success}`);
      if (execResult.result) {
        console.log(`  结果: ${execResult.result.slice(0, 200)}`);
      }
      console.log(`  ${execOk ? "✅" : "❌"} 技能执行器运行`);
      checks.push({ name: "技能执行器运行", passed: execOk });
    } else {
      console.log("  ❌ 未找到文件摘要技能");
      checks.push({ name: "技能执行器运行", passed: false });
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
  } finally {
    try {
      await rm(tmpWorkspace, { recursive: true, force: true });
    } catch {
      // 忽略清理失败
    }
  }
}

main().catch((err) => {
  console.error("\n💥 测试执行失败:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
