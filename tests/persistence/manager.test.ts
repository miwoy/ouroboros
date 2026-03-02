import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createPersistenceManager } from "../../src/persistence/manager.js";
import { createSnapshot } from "../../src/persistence/snapshot.js";
import type { PersistenceDeps, PersistenceConfig } from "../../src/persistence/types.js";
import { DEFAULT_PERSISTENCE_CONFIG } from "../../src/persistence/types.js";
import type { Logger } from "../../src/logger/types.js";

/** 创建测试用 Logger */
function createTestLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

/** 创建测试快照 */
function makeSnapshot(trigger: string = "periodic") {
  return createSnapshot({
    trigger: trigger as any,
    startTime: Date.now() - 1000,
    taskDescription: "测试任务",
    agents: [
      {
        agentId: "agent-1",
        name: "TestAgent",
        executionTree: null,
        hotSessionSnapshot: [],
        childAgentIds: [],
        status: "running",
      },
    ],
    rootAgentIds: ["agent-1"],
  });
}

describe("持久化管理器", () => {
  let tmpDir: string;
  let deps: PersistenceDeps;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `ouro-mgr-test-${randomUUID()}`);
    await mkdir(tmpDir, { recursive: true });
    deps = {
      logger: createTestLogger(),
      workspacePath: tmpDir,
      config: DEFAULT_PERSISTENCE_CONFIG,
    };
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("saveSnapshot", () => {
    it("应保存快照文件和完整性记录", async () => {
      const manager = createPersistenceManager(deps);
      const snapshot = makeSnapshot();

      await manager.saveSnapshot(snapshot);

      // 验证文件存在
      const stateDir = join(tmpDir, "state");
      const files = await readdir(stateDir);
      expect(files).toContain(`snapshot-${snapshot.snapshotId}.json`);
      expect(files).toContain(".integrity.json");
    });

    it("应使用原子写入（无残留 .tmp 文件）", async () => {
      const manager = createPersistenceManager(deps);
      await manager.saveSnapshot(makeSnapshot());

      const stateDir = join(tmpDir, "state");
      const files = await readdir(stateDir);
      const tmpFiles = files.filter((f) => f.endsWith(".tmp"));
      expect(tmpFiles).toHaveLength(0);
    });
  });

  describe("loadLatestSnapshot", () => {
    it("无快照时返回 null", async () => {
      const manager = createPersistenceManager(deps);
      const result = await manager.loadLatestSnapshot();
      expect(result).toBeNull();
    });

    it("应加载最新的快照", async () => {
      const manager = createPersistenceManager(deps);

      const snap1 = makeSnapshot("tool-completed");
      await manager.saveSnapshot(snap1);

      // 短暂延迟确保时间戳不同
      await new Promise((r) => setTimeout(r, 10));

      const snap2 = makeSnapshot("periodic");
      await manager.saveSnapshot(snap2);

      const latest = await manager.loadLatestSnapshot();
      expect(latest).not.toBeNull();
      expect(latest!.snapshotId).toBe(snap2.snapshotId);
    });

    it("损坏文件应被跳过，加载次新的", async () => {
      const manager = createPersistenceManager(deps);

      const snap1 = makeSnapshot();
      await manager.saveSnapshot(snap1);

      await new Promise((r) => setTimeout(r, 10));

      const snap2 = makeSnapshot();
      await manager.saveSnapshot(snap2);

      // 篡改最新文件
      const stateDir = join(tmpDir, "state");
      const snap2Path = join(stateDir, `snapshot-${snap2.snapshotId}.json`);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(snap2Path, "corrupted data", "utf-8");

      const latest = await manager.loadLatestSnapshot();
      expect(latest).not.toBeNull();
      expect(latest!.snapshotId).toBe(snap1.snapshotId);
    });
  });

  describe("deleteSnapshot", () => {
    it("应删除快照文件和对应的完整性记录", async () => {
      const manager = createPersistenceManager(deps);
      const snapshot = makeSnapshot();
      await manager.saveSnapshot(snapshot);

      await manager.deleteSnapshot(snapshot.snapshotId);

      const stateDir = join(tmpDir, "state");
      const files = await readdir(stateDir);
      expect(files).not.toContain(`snapshot-${snapshot.snapshotId}.json`);

      // 完整性记录也应删除
      const records = await manager.listSnapshots();
      expect(records).toHaveLength(0);
    });

    it("删除不存在的快照不应报错", async () => {
      const manager = createPersistenceManager(deps);
      await expect(manager.deleteSnapshot("nonexistent")).resolves.not.toThrow();
    });
  });

  describe("cleanup", () => {
    it("快照数未超限时不清理", async () => {
      const manager = createPersistenceManager(deps);
      const snapshot = makeSnapshot();
      await manager.saveSnapshot(snapshot);

      const deleted = await manager.cleanup();
      expect(deleted).toBe(0);
    });

    it("应清理超限的旧快照", async () => {
      const config: PersistenceConfig = { ...DEFAULT_PERSISTENCE_CONFIG, maxSnapshots: 2 };
      const customDeps = { ...deps, config };
      const manager = createPersistenceManager(customDeps);

      // 保存 4 个快照
      for (let i = 0; i < 4; i++) {
        await manager.saveSnapshot(makeSnapshot());
        await new Promise((r) => setTimeout(r, 10));
      }

      const deleted = await manager.cleanup();
      expect(deleted).toBe(2);

      const remaining = await manager.listSnapshots();
      expect(remaining).toHaveLength(2);
    });
  });

  describe("listSnapshots", () => {
    it("应列出所有快照的完整性记录", async () => {
      const manager = createPersistenceManager(deps);

      await manager.saveSnapshot(makeSnapshot());
      await manager.saveSnapshot(makeSnapshot());

      const records = await manager.listSnapshots();
      expect(records).toHaveLength(2);
    });
  });

  describe("getConfig", () => {
    it("应返回当前配置", () => {
      const manager = createPersistenceManager(deps);
      const config = manager.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.maxSnapshots).toBe(10);
    });
  });
});
