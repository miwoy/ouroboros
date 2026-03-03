/**
 * 阶段七集成测试 — 记忆系统
 *
 * 验证四层记忆（Hot/Cold/短期/长期）的端到端工作流。
 *
 * 测试场景：
 * [1] 创建记忆管理器 + workspace 初始化
 * [2] Hot Memory：添加条目 → token 控制 → 格式化输出
 * [3] Cold Memory：缓存/加载/清理
 * [4] 短期记忆：追加 → 按日期加载 → 列出日期
 * [5] 长期记忆：section 追加 → 内容验证
 * [6] 长期记忆压缩：从短期记忆压缩为摘要
 * [7] 管理器 cleanup：清理 hot + cold
 * [8] 配置系统：memory config 正确解析
 *
 * 用法：npx tsx src/integration/phase7.ts
 */

import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMemoryManager } from "../memory/manager.js";
import { createHotMemory, createColdMemory } from "../memory/session.js";
import { createShortTermMemory } from "../memory/short-term.js";
import { createLongTermMemory } from "../memory/long-term.js";
import type { MemoryEntry } from "../memory/types.js";
import { configSchema } from "../config/schema.js";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`断言失败: ${message}`);
  }
}

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════");
  console.log("  阶段七集成测试 — 记忆系统");
  console.log("═══════════════════════════════════════════════════\n");

  const tmpDir = await mkdtemp(join(tmpdir(), "phase7-"));
  await mkdir(join(tmpDir, "prompts"), { recursive: true });

  try {
    // ─── [1] 记忆管理器初始化 ─────────────────────────────────────
    console.log("[1] 创建记忆管理器...");
    const mgr = createMemoryManager(tmpDir);
    assert(mgr.hot !== undefined, "hot memory 应存在");
    assert(mgr.cold !== undefined, "cold memory 应存在");
    assert(mgr.shortTerm !== undefined, "shortTerm 应存在");
    assert(mgr.longTerm !== undefined, "longTerm 应存在");
    assert(mgr.config.shortTerm === true, "shortTerm 默认启用");
    assert(mgr.config.longTerm === true, "longTerm 默认启用");
    assert(mgr.config.hotSessionMaxTokens === 4000, "hotSessionMaxTokens 默认 4000");
    console.log("  ✓ 记忆管理器创建成功\n");

    // ─── [2] Hot Memory ──────────────────────────────────────────
    console.log("[2] Hot Memory 测试...");
    const hot = createHotMemory(100);

    const entry1: MemoryEntry = {
      timestamp: "2026-03-02T10:00:00",
      type: "conversation",
      content: "用户询问项目架构",
    };
    hot.add(entry1);
    assert(hot.getEntries().length === 1, "应有 1 条记忆");
    assert(hot.estimateTokens() > 0, "token 估算应 > 0");

    const promptText = hot.toPromptText();
    assert(promptText.includes("conversation"), "格式化文本应包含类型");
    assert(promptText.includes("用户询问项目架构"), "格式化文本应包含内容");

    hot.clear();
    assert(hot.getEntries().length === 0, "清空后应为空");
    console.log("  ✓ Hot Memory 工作正常\n");

    // ─── [3] Cold Memory ──────────────────────────────────────────
    console.log("[3] Cold Memory 测试...");
    const cold = createColdMemory(tmpDir);
    await cold.cache("step-analyze", "分析结果: 代码结构良好");
    const loaded = await cold.load("step-analyze");
    assert(loaded === "分析结果: 代码结构良好", "应能加载缓存内容");

    const steps = await cold.listSteps();
    assert(steps.includes("step-analyze"), "应列出缓存步骤");

    await cold.cleanup();
    const afterCleanup = await cold.load("step-analyze");
    assert(afterCleanup === null, "清理后应无法加载");
    console.log("  ✓ Cold Memory 工作正常\n");

    // ─── [4] 短期记忆 ────────────────────────────────────────────
    console.log("[4] 短期记忆测试...");
    const shortTerm = createShortTermMemory(tmpDir);
    await shortTerm.append({
      timestamp: "2026-03-02T10:00:00",
      type: "conversation",
      content: "用户问题：如何实现记忆系统？",
    });
    await shortTerm.append({
      timestamp: "2026-03-02T10:05:00",
      type: "tool-call",
      content: "调用了 read-file 工具",
      metadata: { toolId: "tool:read-file" },
    });
    await shortTerm.append({
      timestamp: "2026-03-02T10:10:00",
      type: "decision",
      content: "决定采用四层记忆架构",
    });

    const entries = await shortTerm.loadByDate("2026-03-02");
    assert(entries.length === 3, "应有 3 条记忆");
    assert(entries[0]!.type === "conversation", "第一条应为 conversation");
    assert(entries[2]!.type === "decision", "第三条应为 decision");

    const dates = await shortTerm.listDates();
    assert(dates.includes("2026-03-02"), "日期列表应包含 2026-03-02");
    console.log("  ✓ 短期记忆工作正常\n");

    // ─── [5] 长期记忆追加 ────────────────────────────────────────
    console.log("[5] 长期记忆追加测试...");
    const longTerm = createLongTermMemory(tmpDir);
    await longTerm.appendKnowledge("四层记忆架构：Hot/Cold/短期/长期");
    await longTerm.appendPattern("先实现类型定义，再实现功能模块");
    await longTerm.appendDecision("使用文件系统而非数据库存储记忆");

    const longContent = await longTerm.load();
    assert(longContent.includes("知识摘要"), "应包含知识摘要 section");
    assert(longContent.includes("行为模式"), "应包含行为模式 section");
    assert(longContent.includes("重要决策"), "应包含重要决策 section");
    assert(longContent.includes("四层记忆架构"), "知识应被追加");
    assert(longContent.includes("先实现类型定义"), "模式应被追加");
    assert(longContent.includes("使用文件系统"), "决策应被追加");
    console.log("  ✓ 长期记忆追加工作正常\n");

    // ─── [6] 长期记忆压缩 ────────────────────────────────────────
    console.log("[6] 长期记忆压缩测试...");
    const mockCallModel = async () => ({
      content: "## 知识摘要\n- 系统采用四层记忆架构\n\n## 行为模式\n- TDD 开发流程",
      toolCalls: [] as const,
      stopReason: "end_turn" as const,
      model: "mock",
      usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
    });

    const summary = await longTerm.compressFromShortTerm("2026-03-02", mockCallModel);
    assert(summary.includes("四层记忆架构"), "压缩摘要应包含关键内容");

    const updatedContent = await longTerm.load();
    assert(updatedContent.includes("2026-03-02 摘要"), "应包含日期摘要标题");
    console.log("  ✓ 长期记忆压缩工作正常\n");

    // ─── [7] 管理器 cleanup ──────────────────────────────────────
    console.log("[7] 管理器 cleanup 测试...");
    mgr.hot.add({
      timestamp: "2026-03-02T12:00:00",
      type: "observation",
      content: "观察记录",
    });
    await mgr.cold.cache("test-step", "测试数据");

    await mgr.cleanup();
    assert(mgr.hot.getEntries().length === 0, "hot 应被清空");
    assert((await mgr.cold.load("test-step")) === null, "cold 应被清理");
    console.log("  ✓ 管理器 cleanup 工作正常\n");

    // ─── [8] 配置系统 ────────────────────────────────────────────
    console.log("[8] 配置系统测试...");
    const config = configSchema.parse({
      system: { workspacePath: tmpDir },
      model: {
        defaultProvider: "test",
        providers: {
          test: { type: "openai", apiKey: "test-key" },
        },
      },
      memory: {
        shortTerm: false,
        hotSessionMaxTokens: 8000,
      },
    });
    assert(config.system.memory.shortTerm === false, "shortTerm 应为 false");
    assert(config.system.memory.longTerm === true, "longTerm 默认应为 true");
    assert(config.system.memory.hotSessionMaxTokens === 8000, "hotSessionMaxTokens 应为 8000");

    // 默认值测试
    const defaultConfig = configSchema.parse({
      system: {},
      model: {
        defaultProvider: "test",
        providers: {
          test: { type: "openai", apiKey: "test-key" },
        },
      },
    });
    assert(defaultConfig.system.memory.shortTerm === true, "默认 shortTerm 为 true");
    assert(defaultConfig.system.memory.longTerm === true, "默认 longTerm 为 true");
    assert(
      defaultConfig.system.memory.hotSessionMaxTokens === 4000,
      "默认 hotSessionMaxTokens 为 4000",
    );
    console.log("  ✓ 配置系统工作正常\n");

    // ─── 结果汇总 ────────────────────────────────────────────────
    console.log("═══════════════════════════════════════════════════");
    console.log("  所有测试通过！记忆系统集成验证完成");
    console.log("═══════════════════════════════════════════════════");
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("集成测试失败:", err);
  process.exit(1);
});
