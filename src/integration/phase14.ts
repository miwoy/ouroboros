/**
 * 阶段十四集成测试 — ReAct Scratchpad + Web 可视化增强 + 环境隔离
 *
 * 验证：
 *  [1] Scratchpad — buildScratchpad 空/正常/截断
 *  [2] Scratchpad — toStepLogEntry 成功/失败
 *  [3] 环境隔离 — resolveHome 三层优先级
 *  [4] ExecutionLogEntry — 类型存在性
 *  [5] WsServerMessageType — 包含 execution_log
 */

import { buildScratchpad, toStepLogEntry } from "../core/scratchpad.js";
import { resolveHome, resolveConfigHome, expandTilde } from "../config/resolver.js";
import type { ExecutionLogEntry } from "../api/types.js";
import type { WsServerMessageType } from "../api/ws-types.js";
import type { ToolCallResult } from "../core/types.js";

let passed = 0;
let failed = 0;
const failedItems: string[] = [];

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    failedItems.push(label);
    console.log(`  ❌ ${label}`);
  }
}

export async function runPhase14(): Promise<void> {
  console.log("\n🔬 阶段十四集成测试 — ReAct Scratchpad + Web 可视化 + 环境隔离\n");

  // ─── [1] Scratchpad — buildScratchpad ────────────────
  console.log("[1] Scratchpad — buildScratchpad");

  assert(buildScratchpad([]) === "", "空输入返回空字符串");

  const entry = { stepIndex: 0, toolId: "tool:test", inputSummary: "{}", outputSummary: "ok", success: true };
  const single = buildScratchpad([entry]);
  assert(single.includes("[步骤 1]"), "单条包含步骤编号");
  assert(single.includes("成功"), "单条包含成功标记");

  const entries30 = Array.from({ length: 30 }, (_, i) => ({
    ...entry,
    stepIndex: i,
    toolId: `tool:t${i}`,
  }));
  const full = buildScratchpad(entries30);
  assert(!full.includes("省略"), "≤30 条不截断");
  assert(full.split("\n").length === 30, "≤30 条全部展示");

  const entries40 = Array.from({ length: 40 }, (_, i) => ({
    ...entry,
    stepIndex: i,
    toolId: `tool:t${i}`,
  }));
  const truncated = buildScratchpad(entries40);
  assert(truncated.includes("省略 10 条"), ">30 条正确截断");
  assert(truncated.split("\n").length === 31, ">30 条行数 = 31");

  // ─── [2] Scratchpad — toStepLogEntry ────────────────
  console.log("[2] Scratchpad — toStepLogEntry");

  const tcr: ToolCallResult = {
    toolId: "tool:bash",
    requestId: "r1",
    input: { cmd: "ls" },
    output: { stdout: "hello" },
    success: true,
    duration: 100,
  };
  const logEntry = toStepLogEntry(3, tcr);
  assert(logEntry.stepIndex === 3, "stepIndex 正确");
  assert(logEntry.toolId === "tool:bash", "toolId 正确");
  assert(logEntry.success === true, "success 正确");
  assert(logEntry.outputSummary.includes("hello"), "outputSummary 包含输出");

  const failTcr: ToolCallResult = {
    toolId: "tool:bad",
    requestId: "r2",
    input: {},
    success: false,
    error: "超时",
    duration: 50,
  };
  const failEntry = toStepLogEntry(1, failTcr);
  assert(failEntry.success === false, "失败调用 success=false");
  assert(failEntry.outputSummary === "超时", "失败调用 outputSummary 使用 error");

  // ─── [3] 环境隔离 — resolveHome ────────────────
  console.log("[3] 环境隔离 — resolveHome");

  // 保存环境
  const origCliCwd = process.env.__OUROBOROS_CLI_CWD;
  const origHome = process.env.OUROBOROS_HOME;

  // 测试默认
  delete process.env.__OUROBOROS_CLI_CWD;
  delete process.env.OUROBOROS_HOME;
  const defaultHome = resolveHome();
  assert(defaultHome.endsWith(".ouroboros"), "默认以 .ouroboros 结尾");

  // 测试 OUROBOROS_HOME
  process.env.OUROBOROS_HOME = "/tmp/test-ouroboros";
  const envHome = resolveHome();
  assert(envHome === "/tmp/test-ouroboros", "OUROBOROS_HOME 环境变量生效");

  // 测试 --cwd 优先
  process.env.__OUROBOROS_CLI_CWD = "/tmp/cwd-test";
  const cliHome = resolveHome();
  assert(cliHome === "/tmp/cwd-test/.ouroboros", "--cwd 优先于 OUROBOROS_HOME");

  // resolveConfigHome
  const configHome = resolveConfigHome();
  assert(configHome === "/tmp/cwd-test/.ouroboros/config.json", "resolveConfigHome 正确");

  // expandTilde
  assert(expandTilde("~/foo") !== "~/foo", "expandTilde 展开 ~");
  assert(expandTilde("/abs/path") === "/abs/path", "expandTilde 不改变绝对路径");

  // 恢复环境
  if (origCliCwd !== undefined) process.env.__OUROBOROS_CLI_CWD = origCliCwd;
  else delete process.env.__OUROBOROS_CLI_CWD;
  if (origHome !== undefined) process.env.OUROBOROS_HOME = origHome;
  else delete process.env.OUROBOROS_HOME;

  // ─── [4] ExecutionLogEntry 类型 ────────────────
  console.log("[4] ExecutionLogEntry 类型存在性");

  const testLogEntry: ExecutionLogEntry = {
    timestamp: new Date().toISOString(),
    level: "tool",
    message: "test",
    toolId: "tool:test",
    duration: 100,
  };
  assert(testLogEntry.level === "tool", "ExecutionLogEntry 类型正确");

  // ─── [5] WsServerMessageType 包含 execution_log ────────────────
  console.log("[5] WsServerMessageType 包含 execution_log");

  const testType: WsServerMessageType = "execution_log";
  assert(testType === "execution_log", "WsServerMessageType 包含 execution_log");

  // ─── 汇总 ────────────────
  console.log(`\n🏁 阶段十四: ${passed} passed, ${failed} failed`);
  if (failedItems.length > 0) {
    console.log("❌ 失败项:");
    failedItems.forEach((item) => console.log(`   - ${item}`));
    process.exit(1);
  }
}

// 直接运行
runPhase14();
