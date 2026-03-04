/**
 * phase-all 集成测试辅助函数
 */

import type { ExecutionNode } from "../core/types.js";
import { TaskState, NodeType } from "../core/types.js";
import type { Logger } from "../logger/types.js";

/** 测试计数器 */
export interface TestCounter {
  passed: number;
  failed: number;
  readonly failedItems: string[];
}

export function createCounter(): TestCounter {
  return { passed: 0, failed: 0, failedItems: [] };
}

/** 断言函数 */
export function assert(counter: TestCounter, condition: boolean, label: string): void {
  if (condition) {
    counter.passed++;
    console.log(`    ✅ ${label}`);
  } else {
    counter.failed++;
    counter.failedItems.push(label);
    console.error(`    ❌ ${label}`);
  }
}

/** 打印测试分节标题 */
export function section(title: string): void {
  console.log(`\n${"─".repeat(56)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(56)}`);
}

/** 空日志器 */
export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** 创建测试用执行节点 */
export function makeNode(id: string, type: string, summary: string, offset = 0): ExecutionNode {
  return {
    id,
    parentId: "root",
    taskId: "task-1",
    state: TaskState.Completed,
    nodeType: type as NodeType,
    summary,
    children: [],
    retryCount: 0,
    createdAt: new Date(Date.now() + offset).toISOString(),
  };
}

/** 简易 JSON 响应解析 */
export async function json(res: Response): Promise<any> {
  return res.json();
}

/** 打印测试汇总 */
export function printSummary(counter: TestCounter): void {
  console.log(`\n${"═".repeat(56)}`);
  console.log(
    `  全系统集成测试结果: ${counter.passed} 通过, ${counter.failed} 失败 / 共 ${counter.passed + counter.failed} 项`,
  );
  console.log(`${"═".repeat(56)}`);

  if (counter.failed > 0) {
    console.log("\n  失败项:");
    for (const item of counter.failedItems) {
      console.log(`    ❌ ${item}`);
    }
    console.log();
    process.exit(1);
  }

  console.log("\n  🎉 所有子系统验证通过！\n");
}
