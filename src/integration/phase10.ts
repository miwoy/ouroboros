/**
 * 阶段十集成测试 — 自我图式与审查反思系统
 *
 * 验证：
 * [1] 身体图式获取（平台、CPU、内存）
 * [2] 身体图式格式化
 * [3] 灵魂图式（世界模型+自我认知）
 * [4] 激素系统初始化和调整
 * [5] 自我图式变量渲染（供模板使用）
 * [6] 审查规则 — 死循环检测
 * [7] 审查规则 — 超时检测
 * [8] 审查程序综合检查
 * [9] 反思程序 — 基础分析
 * [10] 清理
 */

import { getBodySchema, getFullBodySchema, formatBodySchema } from "../schema/body.js";
import {
  getDefaultSoulSchema,
  createSoulSchema,
  formatWorldModel,
  formatSelfAwareness,
} from "../schema/soul.js";
import { createHormoneManager, adjustHormonesForEvent } from "../schema/hormone.js";
import { createSchemaProvider } from "../schema/schema-provider.js";
import { createInspector, DEFAULT_INSPECTOR_CONFIG } from "../inspector/inspector.js";
import { checkDeadLoop, checkTimeout } from "../inspector/rules.js";
import { createReflector } from "../reflection/reflector.js";
import { NodeType, TaskState, TreeState } from "../core/types.js";
import type { ExecutionTree, ExecutionNode } from "../core/types.js";
import type { InspectionContext } from "../inspector/types.js";
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

function makeNode(id: string, type: string, summary: string, createdAtOffset = 0): ExecutionNode {
  return {
    id,
    parentId: "root",
    taskId: "task-1",
    state: TaskState.Completed,
    nodeType: type as any,
    summary,
    children: [],
    retryCount: 0,
    createdAt: new Date(Date.now() + createdAtOffset).toISOString(),
  };
}

async function main() {
  console.log("\n🔬 阶段十集成测试 — 自我图式与审查反思系统\n");

  // [1] 身体图式获取
  try {
    const body = getBodySchema("/tmp/workspace");
    if (!body.platform) throw new Error("缺少 platform");
    if (body.cpuCores <= 0) throw new Error("cpuCores 无效");
    if (!body.memory.totalGB) throw new Error("缺少内存信息");
    if (!body.nodeVersion.startsWith("v")) throw new Error("nodeVersion 格式错误");

    const fullBody = await getFullBodySchema("/tmp");
    if (!fullBody.disk) throw new Error("缺少磁盘信息");

    ok("[1] 身体图式获取（平台、CPU、内存、磁盘）");
  } catch (e) {
    fail("[1] 身体图式获取", e);
  }

  // [2] 身体图式格式化
  try {
    const body = getBodySchema("/tmp/workspace");
    const text = formatBodySchema(body);
    if (!text.includes("运行环境")) throw new Error("缺少运行环境");
    if (!text.includes("CPU")) throw new Error("缺少 CPU");
    if (!text.includes("可用内存")) throw new Error("缺少内存");

    ok("[2] 身体图式格式化");
  } catch (e) {
    fail("[2] 格式化", e);
  }

  // [3] 灵魂图式
  try {
    const soul = getDefaultSoulSchema();
    if (soul.worldModel.rules.length === 0) throw new Error("无规则");
    if (soul.worldModel.constraints.length === 0) throw new Error("无约束");
    if (!soul.selfAwareness.identity) throw new Error("无身份");

    const custom = createSoulSchema({ rules: ["自定义规则"] }, { identity: "测试 Agent" });
    if (custom.worldModel.rules[0] !== "自定义规则") throw new Error("自定义规则失败");
    if (custom.selfAwareness.identity !== "测试 Agent") throw new Error("自定义身份失败");

    const wmText = formatWorldModel(soul.worldModel);
    if (!wmText.includes("World Rules")) throw new Error("格式化失败");

    const saText = formatSelfAwareness(soul.selfAwareness);
    if (!saText.includes("Identity")) throw new Error("格式化失败");

    ok("[3] 灵魂图式（世界模型+自我认知+自定义+格式化）");
  } catch (e) {
    fail("[3] 灵魂图式", e);
  }

  // [4] 激素系统
  try {
    const manager = createHormoneManager({ focusLevel: 70, cautionLevel: 40, creativityLevel: 60 });
    if (manager.getState().focusLevel !== 70) throw new Error("初始值错误");

    manager.adjustFocus(-10);
    if (manager.getState().focusLevel !== 60) throw new Error("调整失败");

    adjustHormonesForEvent(manager, "loop-detected");
    if (manager.getState().cautionLevel <= 40) throw new Error("死循环事件未增加谨慎度");

    manager.reset();
    if (manager.getState().focusLevel !== 70) throw new Error("重置失败");

    ok("[4] 激素系统初始化、调整、事件响应、重置");
  } catch (e) {
    fail("[4] 激素系统", e);
  }

  // [5] 自我图式变量
  try {
    const provider = createSchemaProvider("/tmp/workspace");
    const vars = provider.getVariables();
    if (!vars.platform) throw new Error("缺少 platform");
    if (!vars.worldModel.includes("World Rules")) throw new Error("缺少世界模型");
    if (!vars.selfAwareness.includes("Identity")) throw new Error("缺少自我认知");
    if (!vars.focusLevel) throw new Error("缺少激素值");

    ok("[5] 自我图式变量渲染（供模板使用）");
  } catch (e) {
    fail("[5] 变量渲染", e);
  }

  // [6] 审查规则 — 死循环
  try {
    const loopNodes = [
      makeNode("n1", NodeType.ToolCall, "tool:read /tmp/a.txt", -3000),
      makeNode("n2", NodeType.ToolCall, "tool:read /tmp/a.txt", -2000),
      makeNode("n3", NodeType.ToolCall, "tool:read /tmp/a.txt", -1000),
    ];
    const nodeMap: Record<string, ExecutionNode> = {};
    for (const n of loopNodes) nodeMap[n.id] = n;

    const tree: ExecutionTree = {
      id: "tree-loop",
      agentId: "agent:test",
      rootNodeId: "root",
      nodes: { root: makeNode("root", NodeType.Root, "root"), ...nodeMap },
      activeNodeId: "n3",
      state: TreeState.Running,
      createdAt: new Date().toISOString(),
    };

    const context: InspectionContext = {
      tree,
      bodySchema: getBodySchema("/tmp"),
      startTime: Date.now(),
      config: DEFAULT_INSPECTOR_CONFIG,
    };

    const report = checkDeadLoop(context);
    if (!report) throw new Error("未检测到死循环");
    if (report.exceptionType !== "possible-loop") throw new Error("异常类型错误");

    ok("[6] 审查规则 — 死循环检测");
  } catch (e) {
    fail("[6] 死循环检测", e);
  }

  // [7] 审查规则 — 超时
  try {
    const tree: ExecutionTree = {
      id: "tree-timeout",
      agentId: "agent:test",
      rootNodeId: "root",
      nodes: { root: makeNode("root", NodeType.Root, "root") },
      activeNodeId: "root",
      state: TreeState.Running,
      createdAt: new Date().toISOString(),
    };

    const context: InspectionContext = {
      tree,
      bodySchema: getBodySchema("/tmp"),
      startTime: Date.now() - 5000 * 1000, // 5000 秒前
      config: DEFAULT_INSPECTOR_CONFIG,
    };

    const report = checkTimeout(context);
    if (!report) throw new Error("未检测到超时");
    if (report.exceptionType !== "timeout") throw new Error("异常类型错误");

    ok("[7] 审查规则 — 超时检测");
  } catch (e) {
    fail("[7] 超时检测", e);
  }

  // [8] 审查程序综合
  try {
    const inspector = createInspector(noopLogger);

    const loopNodes = [
      makeNode("n1", NodeType.ToolCall, "tool:read same", -3000),
      makeNode("n2", NodeType.ToolCall, "tool:read same", -2000),
      makeNode("n3", NodeType.ToolCall, "tool:read same", -1000),
    ];
    const nodeMap: Record<string, ExecutionNode> = {};
    for (const n of loopNodes) nodeMap[n.id] = n;

    const tree: ExecutionTree = {
      id: "tree-inspect",
      agentId: "agent:test",
      rootNodeId: "root",
      nodes: { root: makeNode("root", NodeType.Root, "root"), ...nodeMap },
      activeNodeId: "n3",
      state: TreeState.Running,
      createdAt: new Date().toISOString(),
    };

    const result = inspector.inspect({
      tree,
      bodySchema: getBodySchema("/tmp"),
      startTime: Date.now(),
      config: DEFAULT_INSPECTOR_CONFIG,
    });

    if (!result.hasAnomalies) throw new Error("未检测到异常");
    if (result.reports.length === 0) throw new Error("无报告");
    if (result.suggestedActions.length === 0) throw new Error("无建议动作");

    ok("[8] 审查程序综合检查");
  } catch (e) {
    fail("[8] 审查程序", e);
  }

  // [9] 反思程序
  try {
    const reflector = createReflector({
      callModel: async () => ({
        content: JSON.stringify({
          insights: ["文件操作高效完成"],
          patterns: ["先读后写"],
          memorySummary: "成功完成任务",
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
    });

    const output = await reflector.reflect({
      taskDescription: "读取文件并生成摘要",
      agentId: "agent:test",
      executionTree: {
        id: "tree-reflect",
        agentId: "agent:test",
        rootNodeId: "root",
        nodes: { root: makeNode("root", NodeType.Root, "root") },
        activeNodeId: "root",
        state: TreeState.Completed,
        createdAt: new Date().toISOString(),
      },
      steps: [
        {
          stepIndex: 0,
          thought: "读取",
          toolCalls: [
            { toolId: "tool:read", requestId: "r1", input: {}, success: true, duration: 100 },
          ],
          duration: 200,
        },
        {
          stepIndex: 1,
          thought: "写入",
          toolCalls: [
            { toolId: "tool:write", requestId: "r2", input: {}, success: true, duration: 50 },
          ],
          duration: 100,
        },
        {
          stepIndex: 2,
          thought: "验证",
          toolCalls: [
            { toolId: "tool:read", requestId: "r3", input: {}, success: true, duration: 80 },
          ],
          duration: 120,
        },
      ],
      result: "摘要已生成",
      totalDuration: 500,
      success: true,
      errors: [],
    });

    if (output.insights.length === 0) throw new Error("无洞察");
    if (!output.memorySummary) throw new Error("无记忆摘要");

    ok("[9] 反思程序 — 分析 + 记忆写入");
  } catch (e) {
    fail("[9] 反思程序", e);
  }

  // [10] 清理
  ok("[10] 无需清理");

  console.log("\n" + (process.exitCode ? "❌ 部分测试失败" : "✅ 阶段十集成测试全部通过") + "\n");
}

main();
