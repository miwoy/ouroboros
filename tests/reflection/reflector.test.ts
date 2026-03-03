/**
 * 反思器测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createReflector } from "../../src/reflection/reflector.js";
import { TreeState, TaskState, NodeType } from "../../src/core/types.js";
import type { ExecutionTree } from "../../src/core/types.js";
import type { ReflectionInput, ReflectionDeps } from "../../src/reflection/types.js";
import type { Logger } from "../../src/logger/types.js";
import type { LongTermMemory } from "../../src/memory/types.js";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initWorkspace } from "../../src/workspace/init.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "reflector-test-"));
  await initWorkspace(tempDir);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function makeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeTree(): ExecutionTree {
  return {
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
        summary: "root task",
        children: [],
        retryCount: 0,
        createdAt: new Date().toISOString(),
      },
    },
    activeNodeId: "root",
    state: TreeState.Completed,
    createdAt: new Date().toISOString(),
  };
}

function makeDeps(modelResponse?: string): ReflectionDeps {
  return {
    callModel: vi.fn().mockResolvedValue({
      content: modelResponse ?? JSON.stringify({
        insights: ["学到了新技巧"],
        patterns: ["先读取再写入是高效模式"],
        memorySummary: "成功完成文件操作任务",
      }),
      toolCalls: [],
      stopReason: "end_turn" as const,
      model: "mock",
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    }),
    longTermMemory: {
      load: vi.fn().mockResolvedValue(""),
      appendKnowledge: vi.fn().mockResolvedValue(undefined),
      appendPattern: vi.fn().mockResolvedValue(undefined),
      appendDecision: vi.fn().mockResolvedValue(undefined),
      compressFromShortTerm: vi.fn().mockResolvedValue(""),
    } as unknown as LongTermMemory,
    logger: makeLogger(),
    workspacePath: tempDir,
  };
}

function makeInput(overrides?: Partial<ReflectionInput>): ReflectionInput {
  return {
    taskDescription: "读取文件并生成摘要",
    agentId: "agent:test",
    executionTree: makeTree(),
    steps: [
      {
        stepIndex: 0,
        thought: "我需要读取文件",
        toolCalls: [
          {
            toolId: "tool:read",
            requestId: "req-1",
            input: { filePath: "/tmp/a.txt" },
            output: { content: "文件内容" },
            success: true,
            duration: 100,
          },
        ],
        duration: 200,
      },
      {
        stepIndex: 1,
        thought: "现在生成摘要",
        toolCalls: [
          {
            toolId: "tool:call-model",
            requestId: "req-2",
            input: { messages: [] },
            output: { result: "摘要" },
            success: true,
            duration: 500,
          },
        ],
        duration: 600,
      },
      {
        stepIndex: 2,
        thought: "写入结果",
        toolCalls: [
          {
            toolId: "tool:write",
            requestId: "req-3",
            input: { filePath: "/tmp/summary.txt" },
            success: true,
            duration: 50,
          },
        ],
        duration: 100,
      },
    ],
    result: "文件摘要已生成",
    totalDuration: 1000,
    success: true,
    errors: [],
    ...overrides,
  };
}

describe("createReflector", () => {
  it("应生成反思输出", async () => {
    const deps = makeDeps();
    const reflector = createReflector(deps);
    const input = makeInput();

    const output = await reflector.reflect(input);

    expect(output.insights.length).toBeGreaterThan(0);
    expect(output.memorySummary).toBeTruthy();
    expect(deps.callModel).toHaveBeenCalled();
    expect(deps.longTermMemory.appendKnowledge).toHaveBeenCalled();
  });

  it("模型反思失败时应使用基础分析", async () => {
    const deps = makeDeps();
    (deps.callModel as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("模型不可用"));

    const reflector = createReflector(deps);
    const output = await reflector.reflect(makeInput());

    // 即使模型失败也应产出基础分析
    expect(output.insights.length).toBeGreaterThan(0);
    expect(output.memorySummary).toBeTruthy();
  });

  it("成功任务应生成 Skill 建议", async () => {
    const deps = makeDeps();
    const reflector = createReflector(deps, { minSkillConfidence: 0.5 });
    const input = makeInput(); // 3 步骤，3 种工具

    const output = await reflector.reflect(input);

    expect(output.skillSuggestions.length).toBeGreaterThan(0);
    expect(output.skillSuggestions[0]!.toolsUsed.length).toBeGreaterThan(0);
    expect(output.skillSuggestions[0]!.confidence).toBeGreaterThan(0);
  });

  it("失败任务不应生成 Skill 建议", async () => {
    const deps = makeDeps();
    const reflector = createReflector(deps);
    const input = makeInput({ success: false });

    const output = await reflector.reflect(input);

    expect(output.skillSuggestions).toHaveLength(0);
  });

  it("反思禁用时应返回空结果", async () => {
    const deps = makeDeps();
    const reflector = createReflector(deps, { enabled: false });

    const output = await reflector.reflect(makeInput());

    expect(output.insights).toHaveLength(0);
    expect(output.patterns).toHaveLength(0);
    expect(output.skillSuggestions).toHaveLength(0);
    expect(deps.callModel).not.toHaveBeenCalled();
  });

  it("应将反思结果写入长期记忆", async () => {
    const deps = makeDeps();
    const reflector = createReflector(deps);

    await reflector.reflect(makeInput());

    expect(deps.longTermMemory.appendKnowledge).toHaveBeenCalled();
  });

  it("长期记忆写入失败不应影响反思", async () => {
    const deps = makeDeps();
    (deps.longTermMemory.appendKnowledge as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("写入失败"),
    );

    const reflector = createReflector(deps);
    const output = await reflector.reflect(makeInput());

    // 反思输出仍应正常
    expect(output.insights.length).toBeGreaterThan(0);
  });

  it("少于 3 步骤不应建议 Skill", async () => {
    const deps = makeDeps();
    const reflector = createReflector(deps, { minSkillConfidence: 0.5 });
    const input = makeInput({
      steps: [makeInput().steps[0]!], // 只有 1 步
    });

    const output = await reflector.reflect(input);
    expect(output.skillSuggestions).toHaveLength(0);
  });

  it("应记录反思日志", async () => {
    const deps = makeDeps();
    const reflector = createReflector(deps);

    await reflector.reflect(makeInput());

    expect(deps.logger.info).toHaveBeenCalledWith(
      "reflection",
      "开始反思",
      expect.any(Object),
    );
    expect(deps.logger.info).toHaveBeenCalledWith(
      "reflection",
      "反思完成",
      expect.any(Object),
    );
  });

  // ─── selfUpdates 相关测试 ──────────────────────────────────

  it("应解析模型返回的 selfUpdates 并编辑 self.md", async () => {
    const modelResponse = JSON.stringify({
      insights: ["发现用户名"],
      patterns: [],
      memorySummary: "记录用户信息",
      selfUpdates: {
        identityUpdate: "我是小助手，专注于代码审查",
        userUpdate: "**Name**: 张三\n偏好中文交流",
      },
    });

    const deps = makeDeps(modelResponse);
    const reflector = createReflector(deps);
    const output = await reflector.reflect(makeInput());

    expect(output.selfUpdates).toBeDefined();
    expect(output.selfUpdates!.identityUpdate).toBe("我是小助手，专注于代码审查");
    expect(output.selfUpdates!.userUpdate).toContain("张三");

    // 验证 self.md 被编辑
    const selfContent = await readFile(join(tempDir, "prompts", "self.md"), "utf-8");
    expect(selfContent).toContain("我是小助手，专注于代码审查");
    expect(selfContent).toContain("张三");
  });

  it("worldModelUpdate 应追加到现有 World Model 内容", async () => {
    const modelResponse = JSON.stringify({
      insights: [],
      patterns: [],
      memorySummary: "ok",
      selfUpdates: {
        worldModelUpdate: "- **新原则** — 新发现的原则",
      },
    });

    const deps = makeDeps(modelResponse);
    const reflector = createReflector(deps);
    await reflector.reflect(makeInput());

    // 验证 self.md 的 World Model 章节包含原有内容 + 新追加
    const selfContent = await readFile(join(tempDir, "prompts", "self.md"), "utf-8");
    expect(selfContent).toContain("自我指涉"); // 原有内容保留
    expect(selfContent).toContain("新发现的原则"); // 新内容追加
  });

  it("无 selfUpdates 时不应修改 self.md", async () => {
    const deps = makeDeps();
    const reflector = createReflector(deps);

    // 记录原始内容
    const originalContent = await readFile(join(tempDir, "prompts", "self.md"), "utf-8");

    await reflector.reflect(makeInput());

    const afterContent = await readFile(join(tempDir, "prompts", "self.md"), "utf-8");
    expect(afterContent).toBe(originalContent);
  });

  it("self.md 编辑失败不应影响反思输出", async () => {
    const modelResponse = JSON.stringify({
      insights: ["ok"],
      patterns: [],
      memorySummary: "ok",
      selfUpdates: {
        identityUpdate: "新身份",
      },
    });

    // 使用不存在的 workspacePath
    const deps = makeDeps(modelResponse);
    (deps as { workspacePath: string }).workspacePath = "/nonexistent/path";

    const reflector = createReflector(deps);
    const output = await reflector.reflect(makeInput());

    // 反思仍应成功
    expect(output.insights.length).toBeGreaterThan(0);
    expect(deps.logger.warn).toHaveBeenCalledWith(
      "reflection",
      "self.md 章节更新失败",
      expect.any(Object),
    );
  });
});
