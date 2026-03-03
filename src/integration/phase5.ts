/**
 * 阶段五：二级工具系统集成测试
 *
 * 验收流程：
 * 1. 加载配置 + 初始化 workspace
 * 2. 创建工具注册表
 * 3. 验证 13 个内置工具注册完成（4 一级 + 9 二级）
 * 4. 测试 tool:bash 执行命令
 * 5. 测试 tool:write 写入文件
 * 6. 测试 tool:read 读取文件
 * 7. 测试 tool:edit 编辑文件
 * 8. 测试 tool:find 查找文件
 * 9. 测试 tool:create-skill 创建技能
 * 10. 测试 tool:search-skill 检索技能
 * 11. 验证 core.md 包含二级工具描述
 * 12. 清理
 *
 * 使用方式：
 *   npm run test:phase5
 */

import { readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../config/index.js";
import { createProviderRegistry, createCallModel } from "../model/index.js";
import { initWorkspace } from "../workspace/index.js";
import { createToolRegistry, createToolExecutor } from "../tool/index.js";
import { loadCorePrompt } from "../prompt/store.js";

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
  console.log("🐍 Ouroboros 阶段五 · 二级工具系统集成测试\n");

  const checks: Check[] = [];

  // 使用临时目录避免污染真实 workspace
  const tmpWorkspace = join(tmpdir(), `ouroboros-phase5-${Date.now()}`);

  try {
    // ── 1. 加载配置 + 初始化 workspace ──────────────────────────────
    console.log("[1/12] 加载配置...");
    const config = await loadConfig();
    console.log(`  默认提供商: ${config.agents.default.model.split("/")[0]}`);

    console.log("[2/12] 初始化临时 workspace...");
    await initWorkspace(tmpWorkspace);
    console.log(`  workspace: ${tmpWorkspace}`);

    // ── 2. 创建工具注册表 + 执行器 ─────────────────────────────────
    console.log("[3/12] 创建工具注册表 + 执行器...");
    const providerRegistry = createProviderRegistry(config.providers);
    const callModel = createCallModel(
      config,
      providerRegistry,
      config.agents.default.model.split("/")[0],
    );
    const registry = await createToolRegistry(tmpWorkspace);
    const executor = createToolExecutor(registry, {
      workspacePath: tmpWorkspace,
      callModel,
    });

    // ── 3. 验证 13 个内置工具注册 ────────────────────────────────────
    console.log("[4/12] 验证内置工具注册...");
    const allTools = registry.list();
    const builtinCount = allTools.filter((t) => t.origin === "system").length;
    const toolIds = allTools.map((t) => t.id);
    console.log(`  注册工具数: ${builtinCount} 个系统工具`);

    const expectedIds = [
      // 一级
      "tool:call-model",
      "tool:run-agent",
      "tool:search-tool",
      "tool:create-tool",
      // 二级
      "tool:bash",
      "tool:read",
      "tool:write",
      "tool:edit",
      "tool:find",
      "tool:web-search",
      "tool:web-fetch",
      "tool:search-skill",
      "tool:create-skill",
    ];
    const allRegistered = expectedIds.every((id) => toolIds.includes(id));
    console.log(`  ${allRegistered ? "✅" : "❌"} 所有 13 个内置工具已注册`);
    checks.push({ name: "13 个内置工具注册", passed: allRegistered && builtinCount === 13 });

    // ── 4. 测试 tool:bash ──────────────────────────────────────────
    console.log("[5/12] 测试 tool:bash...");
    const bashResult = await executor.execute({
      requestId: "test-bash-1",
      toolId: "tool:bash",
      input: { command: "echo 'hello ouroboros'" },
      caller: { entityId: "test" },
    });
    const bashOk =
      bashResult.success && (bashResult.output?.["stdout"] as string).includes("hello ouroboros");
    console.log(`  stdout: ${(bashResult.output?.["stdout"] as string)?.trim()}`);
    console.log(`  ${bashOk ? "✅" : "❌"} bash 命令执行`);
    checks.push({ name: "bash 命令执行", passed: bashOk });

    // ── 5. 测试 tool:write ─────────────────────────────────────────
    console.log("[6/12] 测试 tool:write...");
    const writeResult = await executor.execute({
      requestId: "test-write-1",
      toolId: "tool:write",
      input: { path: "tmp/test-phase5.txt", content: "Ouroboros Phase 5 Test" },
      caller: { entityId: "test" },
    });
    const writeOk = writeResult.success === true;
    console.log(`  ${writeOk ? "✅" : "❌"} 文件写入`);
    checks.push({ name: "文件写入", passed: writeOk });

    // ── 6. 测试 tool:read ──────────────────────────────────────────
    console.log("[7/12] 测试 tool:read...");
    const readResult = await executor.execute({
      requestId: "test-read-1",
      toolId: "tool:read",
      input: { path: "tmp/test-phase5.txt" },
      caller: { entityId: "test" },
    });
    const readContent = readResult.output?.["content"] as string;
    const readOk = readResult.success && readContent === "Ouroboros Phase 5 Test";
    console.log(`  内容: "${readContent}"`);
    console.log(`  ${readOk ? "✅" : "❌"} 文件读取`);
    checks.push({ name: "文件读取", passed: readOk });

    // ── 7. 测试 tool:edit ──────────────────────────────────────────
    console.log("[8/12] 测试 tool:edit...");
    const editResult = await executor.execute({
      requestId: "test-edit-1",
      toolId: "tool:edit",
      input: {
        path: "tmp/test-phase5.txt",
        oldString: "Phase 5",
        newString: "Phase 5 ✓",
      },
      caller: { entityId: "test" },
    });
    const editOk = editResult.success === true;
    // 验证文件已被修改
    const editedContent = await readFile(join(tmpWorkspace, "tmp/test-phase5.txt"), "utf-8");
    const editContentOk = editedContent === "Ouroboros Phase 5 ✓ Test";
    console.log(`  修改后: "${editedContent}"`);
    console.log(`  ${editOk && editContentOk ? "✅" : "❌"} 文件编辑`);
    checks.push({ name: "文件编辑", passed: editOk && editContentOk });

    // ── 8. 测试 tool:find ──────────────────────────────────────────
    console.log("[9/12] 测试 tool:find...");
    // 先创建几个测试文件
    await mkdir(join(tmpWorkspace, "tmp/sub"), { recursive: true });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(tmpWorkspace, "tmp/sub/a.ts"), "", "utf-8");
    await writeFile(join(tmpWorkspace, "tmp/sub/b.ts"), "", "utf-8");
    await writeFile(join(tmpWorkspace, "tmp/sub/c.js"), "", "utf-8");

    const findResult = await executor.execute({
      requestId: "test-find-1",
      toolId: "tool:find",
      input: { pattern: "**/*.ts", path: "tmp" },
      caller: { entityId: "test" },
    });
    const foundFiles = findResult.output?.["files"] as string[];
    const findOk = findResult.success && foundFiles?.length === 2;
    console.log(`  找到: ${foundFiles?.join(", ")}`);
    console.log(`  ${findOk ? "✅" : "❌"} 文件查找`);
    checks.push({ name: "文件查找", passed: findOk });

    // ── 9. 测试 tool:create-skill ──────────────────────────────────
    console.log("[10/12] 测试 tool:create-skill...");
    const createSkillResult = await executor.execute({
      requestId: "test-create-skill-1",
      toolId: "tool:create-skill",
      input: {
        name: "文件摘要",
        description: "读取文件并生成摘要",
        promptTemplate: "请读取文件 {{path}} 并生成简要摘要",
        tags: ["摘要", "文件"],
      },
      caller: { entityId: "test" },
    });
    const skillId = createSkillResult.output?.["skillId"] as string;
    const createSkillOk = createSkillResult.success && skillId === "skill:文件摘要";
    console.log(`  技能 ID: ${skillId}`);
    console.log(`  ${createSkillOk ? "✅" : "❌"} 技能创建`);
    checks.push({ name: "技能创建", passed: createSkillOk });

    // ── 10. 测试 tool:search-skill ──────────────────────────────────
    console.log("[11/12] 测试 tool:search-skill...");
    const searchSkillResult = await executor.execute({
      requestId: "test-search-skill-1",
      toolId: "tool:search-skill",
      input: { query: "摘要" },
      caller: { entityId: "test" },
    });
    const searchSkillOk = searchSkillResult.success;
    console.log(`  查询: "摘要"`);
    console.log(`  ${searchSkillOk ? "✅" : "❌"} 技能检索`);
    checks.push({ name: "技能检索", passed: searchSkillOk });

    // ── 11. 验证 core.md 包含二级工具描述 ────────────────────────────
    console.log("[12/12] 验证 core.md 包含二级工具描述...");
    const coreContent = await loadCorePrompt();
    const coreHasSecondary =
      coreContent.includes("tool:bash") &&
      coreContent.includes("tool:read") &&
      coreContent.includes("tool:write") &&
      coreContent.includes("tool:edit") &&
      coreContent.includes("tool:find") &&
      coreContent.includes("tool:web-search") &&
      coreContent.includes("tool:web-fetch") &&
      coreContent.includes("tool:search-skill") &&
      coreContent.includes("tool:create-skill") &&
      coreContent.includes("二级工具");
    console.log(`  ${coreHasSecondary ? "✅" : "❌"} core.md 包含二级工具描述`);
    checks.push({ name: "core.md 包含二级工具描述", passed: coreHasSecondary });

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
    // 清理临时目录
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
