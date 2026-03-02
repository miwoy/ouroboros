/**
 * handlers 辅助函数
 *
 * 从 handlers.ts 抽取的通用工具函数，保持主文件精简。
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SSEEvent } from "./types.js";

/** SSE 事件队列（桥接 callback → async generator） */
export function createEventQueue(): {
  pushEvent: (event: SSEEvent | null) => void;
  waitForEvent: () => Promise<void>;
  drainQueue: (wait: () => Promise<void>) => AsyncGenerator<SSEEvent>;
} {
  const queue: Array<SSEEvent | null> = [];
  let notifier: (() => void) | null = null;

  function pushEvent(event: SSEEvent | null): void {
    queue.push(event);
    if (notifier) {
      notifier();
      notifier = null;
    }
  }

  function waitForEvent(): Promise<void> {
    return new Promise((resolve) => {
      notifier = resolve;
    });
  }

  async function* drainQueue(wait: () => Promise<void>): AsyncGenerator<SSEEvent> {
    while (true) {
      while (queue.length === 0) {
        await wait();
      }
      const event = queue.shift()!;
      if (event === null) break;
      yield event;
    }
  }

  return { pushEvent, waitForEvent, drainQueue };
}

/** 从 solution registry 加载已注册 Agent 列表 */
export async function loadRegisteredAgents(workspacePath: string): Promise<
  readonly {
    id: string;
    name: string;
    description: string;
    status: string;
    skills: readonly string[];
  }[]
> {
  try {
    const registryPath = join(workspacePath, "solutions", "registry.json");
    const raw = await readFile(registryPath, "utf-8");
    const data = JSON.parse(raw) as {
      solutions?: readonly {
        id: string;
        name: string;
        description: string;
        status: string;
        skills?: readonly string[];
      }[];
    };
    return (data.solutions ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      status: s.status,
      skills: s.skills ?? [],
    }));
  } catch {
    return [];
  }
}

/** 缓存的 package.json 版本号 */
let cachedVersion: string | null = null;

/** 读取 package.json 版本（缓存） */
export async function readPackageVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;
  try {
    const pkgPath = join(import.meta.dirname ?? ".", "..", "..", "package.json");
    const raw = await readFile(pkgPath, "utf-8");
    cachedVersion = (JSON.parse(raw) as { version: string }).version;
    return cachedVersion;
  } catch {
    return "unknown";
  }
}
