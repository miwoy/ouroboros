/**
 * 提示词系统集成测试
 *
 * 验证：
 * [1] core.md — 仅系统规则，不含工具/技能描述
 * [2] self.md — 灵魂内容内联，8 个动态变量
 * [3] tool.md — 列表格式，包含所有内置工具
 * [4] skill.md / agent.md — 列表格式
 * [5] section 编辑 — readSection / replaceSection
 * [6] SchemaProvider — 8 个动态变量（无 soul）
 * [7] 反思系统 — 通过 replaceSection 编辑 self.md
 * [8] 清理
 */

import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { strict as assert } from "node:assert";

import { initWorkspace } from "../workspace/init.js";
import {
  getCorePath,
  getPromptFilePath,
  readSection,
  replaceSection,
  copyDefaultTemplates,
} from "../prompt/store.js";
import { renderTemplate } from "../prompt/template.js";
import { createSchemaProvider } from "../schema/schema-provider.js";
import { createReflector } from "../reflection/reflector.js";
import { TaskState, NodeType, TreeState } from "../core/types.js";
import type { Logger } from "../logger/types.js";

function ok(label: string) {
  console.log(`  ✅ ${label}`);
}

function fail(label: string, err: unknown) {
  console.error(`  ❌ ${label}:`, err);
  process.exitCode = 1;
}

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

async function main() {
  console.log("\n🔬 提示词系统集成测试\n");

  let workDir: string;
  try {
    workDir = await mkdtemp(join(tmpdir(), "prompt-integration-"));
  } catch (e) {
    fail("创建临时目录", e);
    return;
  }

  try {
    await initWorkspace(workDir);

    // ═══════════════════════════════════════════════════════
    // [1] core.md — 仅系统规则
    // ═══════════════════════════════════════════════════════
    try {
      const corePath = getCorePath();
      const core = await readFile(corePath, "utf-8");
      const lines = core.split("\n").filter((l) => l.trim()).length;
      assert(lines <= 50, `core.md 应 ≤50 有效行，实际 ${lines}`);
      assert(core.includes("## Directives"), "core.md 应包含 Directives");
      assert(core.includes("## ReAct Protocol"), "core.md 应包含 ReAct Protocol");
      assert(core.includes("## Tool Use"), "core.md 应包含 Tool Use");
      assert(core.includes("## Output Language"), "core.md 应包含 Output Language");
      assert(!core.includes("tool:call-model"), "core.md 不应包含工具描述");
      assert(!core.includes("tool:bash"), "core.md 不应包含二级工具描述");
      assert(!core.includes("skill:create-solution"), "core.md 不应包含技能描述");

      ok("[1] core.md — 仅系统规则，无工具/技能描述");
    } catch (e) {
      fail("[1] core.md", e);
    }

    // ═══════════════════════════════════════════════════════
    // [2] self.md — 灵魂内容内联 + 8 个动态变量
    // ═══════════════════════════════════════════════════════
    try {
      const selfPath = getPromptFilePath(workDir, "self");
      const self = await readFile(selfPath, "utf-8");

      // 灵魂内容内联检查
      assert(self.includes("### World Model"), "self.md 应有 World Model 章节");
      assert(self.includes("### Identity"), "self.md 应有 Identity 章节");
      assert(self.includes("### User"), "self.md 应有 User 章节");
      assert(self.includes("自我指涉"), "self.md 应包含世界模型原则");
      assert(self.includes("Ouroboros"), "self.md 应包含身份描述");

      // 变量占位符检查
      assert(self.includes("{{currentDateTime}}"), "self.md 应有 currentDateTime 变量");
      assert(self.includes("{{platform}}"), "self.md 应有 platform 变量");
      assert(self.includes("{{focusLevel}}"), "self.md 应有 focusLevel 变量");

      // 不应有 soul 变量
      assert(!self.includes("{{worldModel}}"), "self.md 不应有 worldModel 变量");
      assert(!self.includes("{{selfAwareness}}"), "self.md 不应有 selfAwareness 变量");
      assert(!self.includes("{{userModel}}"), "self.md 不应有 userModel 变量");

      // 模板渲染测试
      const provider = await createSchemaProvider(workDir);
      const vars = provider.getVariables();
      const rendered = renderTemplate(self, vars as unknown as Record<string, string>);
      assert(
        !rendered.includes("{{"),
        `渲染后不应有未替换的变量: ${rendered.match(/\{\{[^}]+\}\}/)?.[0]}`,
      );
      assert(rendered.includes("自我指涉"), "渲染后应保留内联灵魂内容");

      ok("[2] self.md — 灵魂内联 + 8 变量渲染正确");
    } catch (e) {
      fail("[2] self.md", e);
    }

    // ═══════════════════════════════════════════════════════
    // [3] tool.md — 列表格式
    // ═══════════════════════════════════════════════════════
    try {
      const toolPath = getPromptFilePath(workDir, "tool");
      const tool = await readFile(toolPath, "utf-8");
      assert(tool.includes("## Primary Tools"), "tool.md 应有 Primary Tools 章节");
      assert(tool.includes("## Secondary Tools"), "tool.md 应有 Secondary Tools 章节");
      assert(tool.includes("## Custom Tools"), "tool.md 应有 Custom Tools 章节");
      assert(tool.includes("**tool:call-model**"), "tool.md 应包含 call-model 工具");
      assert(tool.includes("**tool:bash**"), "tool.md 应包含 bash 工具");
      assert(tool.includes("**tool:web-search**"), "tool.md 应包含 web-search 工具");
      // 不应有表格格式
      assert(!tool.includes("| Name |"), "tool.md 不应使用表格格式");

      ok("[3] tool.md — 列表格式，含所有内置工具");
    } catch (e) {
      fail("[3] tool.md", e);
    }

    // ═══════════════════════════════════════════════════════
    // [4] skill.md / agent.md — 列表格式
    // ═══════════════════════════════════════════════════════
    try {
      const skillPath = getPromptFilePath(workDir, "skill");
      const skill = await readFile(skillPath, "utf-8");
      assert(skill.includes("## Built-in Skills"), "skill.md 应有 Built-in Skills 章节");
      assert(skill.includes("**skill:create-solution**"), "skill.md 应包含 create-solution 技能");

      const agentPath = getPromptFilePath(workDir, "agent");
      const agent = await readFile(agentPath, "utf-8");
      assert(agent.includes("## Built-in Solutions"), "agent.md 应有 Built-in Solutions 章节");
      assert(
        agent.includes("**solution:create-super-agent**"),
        "agent.md 应包含 create-super-agent",
      );

      ok("[4] skill.md / agent.md — 列表格式");
    } catch (e) {
      fail("[4] skill.md / agent.md", e);
    }

    // ═══════════════════════════════════════════════════════
    // [5] section 编辑
    // ═══════════════════════════════════════════════════════
    try {
      const selfPath = getPromptFilePath(workDir, "self");

      // 读取 World Model 章节
      const wm = await readSection(selfPath, "World Model", 3);
      assert(wm !== null, "readSection 应返回 World Model 内容");
      assert(wm!.includes("自我指涉"), "World Model 应包含原则");

      // 替换 Identity 章节
      await replaceSection(selfPath, "Identity", "我是测试 Agent", 3);
      const identity = await readSection(selfPath, "Identity", 3);
      assert(identity === "我是测试 Agent", "replaceSection 应替换 Identity 内容");

      // 追加新章节
      await replaceSection(selfPath, "Test Section", "测试内容", 3);
      const testSection = await readSection(selfPath, "Test Section", 3);
      assert(testSection === "测试内容", "replaceSection 应追加新章节");

      // World Model 不受影响
      const wmAfter = await readSection(selfPath, "World Model", 3);
      assert(wmAfter!.includes("自我指涉"), "替换其他章节不影响 World Model");

      ok("[5] section 编辑 — readSection / replaceSection 正确");
    } catch (e) {
      fail("[5] section 编辑", e);
    }

    // ═══════════════════════════════════════════════════════
    // [6] SchemaProvider — 8 个动态变量
    // ═══════════════════════════════════════════════════════
    try {
      const provider = await createSchemaProvider(workDir);
      const vars = provider.getVariables();

      // 8 个变量
      assert(!!vars.platform, "platform 变量存在");
      assert(!!vars.availableMemory, "availableMemory 变量存在");
      assert(!!vars.gpu, "gpu 变量存在");
      assert(!!vars.workspacePath, "workspacePath 变量存在");
      assert(!!vars.currentDateTime, "currentDateTime 变量存在");
      assert(!!vars.focusLevel, "focusLevel 变量存在");
      assert(!!vars.cautionLevel, "cautionLevel 变量存在");
      assert(!!vars.creativityLevel, "creativityLevel 变量存在");

      // 不应有 soul 变量
      assert(!("worldModel" in vars), "不应有 worldModel 变量");
      assert(!("selfAwareness" in vars), "不应有 selfAwareness 变量");
      assert(!("userModel" in vars), "不应有 userModel 变量");

      // 不应有 getSoulSchema / updateSoul 方法
      assert(!("getSoulSchema" in provider), "不应有 getSoulSchema 方法");
      assert(!("updateSoul" in provider), "不应有 updateSoul 方法");

      ok("[6] SchemaProvider — 8 个动态变量，无 soul 方法");
    } catch (e) {
      fail("[6] SchemaProvider", e);
    }

    // ═══════════════════════════════════════════════════════
    // [7] 反思系统 — 通过 replaceSection 编辑 self.md
    // ═══════════════════════════════════════════════════════
    try {
      // 先恢复 self.md 到默认状态
      await copyDefaultTemplates(workDir);
      // 强制重新复制（删除后复制）
      const { writeFile: wf } = await import("node:fs/promises");
      const selfPath = getPromptFilePath(workDir, "self");
      const templatePath = getCorePath().replace("core.md", "self.md");
      const templateContent = await readFile(templatePath, "utf-8");
      await wf(selfPath, templateContent, "utf-8");

      const reflector = createReflector({
        callModel: async () => ({
          content: JSON.stringify({
            insights: ["学到了用户名"],
            patterns: [],
            memorySummary: "记录用户信息",
            selfUpdates: {
              userUpdate: "**Name**: 集成测试用户\n偏好中文交流",
              worldModelUpdate: "- **测试原则** — 集成测试验证",
            },
          }),
          toolCalls: [],
          stopReason: "end_turn" as const,
          model: "mock",
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        }),
        longTermMemory: {
          load: async () => "",
          appendKnowledge: async () => {},
          appendPattern: async () => {},
          appendDecision: async () => {},
          compressFromShortTerm: async () => "",
        } as any,
        logger: noopLogger,
        workspacePath: workDir,
      });

      await reflector.reflect({
        taskDescription: "测试反思",
        agentId: "agent:test",
        executionTree: {
          id: "tree-1",
          agentId: "agent:test",
          rootNodeId: "root",
          nodes: {
            root: {
              id: "root",
              parentId: null,
              taskId: "task-1",
              state: TaskState.Completed,
              nodeType: NodeType.Root,
              summary: "root",
              children: [],
              retryCount: 0,
              createdAt: new Date().toISOString(),
            },
          },
          activeNodeId: "root",
          state: TreeState.Completed,
          createdAt: new Date().toISOString(),
        },
        steps: [],
        result: "完成",
        totalDuration: 100,
        success: true,
        errors: [],
      });

      // 验证 self.md 被编辑
      const selfContent = await readFile(selfPath, "utf-8");
      assert(selfContent.includes("集成测试用户"), "反思后 self.md 应包含用户信息");
      assert(selfContent.includes("测试原则"), "反思后 self.md 应包含新原则");
      assert(selfContent.includes("自我指涉"), "反思后原有原则应保留");

      // 验证 soul.json 不存在
      const { access: fsAccess } = await import("node:fs/promises");
      let soulJsonExists = true;
      try {
        await fsAccess(join(workDir, "schema", "soul.json"));
      } catch {
        soulJsonExists = false;
      }
      assert(!soulJsonExists, "反思后不应创建 soul.json");

      ok("[7] 反思系统 — 直接编辑 self.md，不创建 soul.json");
    } catch (e) {
      fail("[7] 反思系统", e);
    }

    // ═══════════════════════════════════════════════════════
    // [8] 清理
    // ═══════════════════════════════════════════════════════
    try {
      await rm(workDir, { recursive: true, force: true });
      ok("[8] 清理完成");
    } catch (e) {
      fail("[8] 清理", e);
    }
  } catch (e) {
    fail("全局异常", e);
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }

  console.log("\n🏁 提示词系统集成测试完成\n");
}

main().catch((e) => {
  console.error("集成测试致命错误:", e);
  process.exitCode = 1;
});
