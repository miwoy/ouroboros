/**
 * 持久化管理器
 *
 * 负责快照的保存、加载、清理。
 * 使用原子写入（.tmp → rename）确保文件完整性。
 */

import { readFile, writeFile, readdir, unlink, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  PersistenceManager,
  PersistenceConfig,
  SystemStateSnapshot,
  IntegrityRecord,
  PersistenceDeps,
} from "./types.js";
import { DEFAULT_PERSISTENCE_CONFIG } from "./types.js";
import { serializeSnapshot, deserializeSnapshot } from "./snapshot.js";
import {
  createIntegrityRecord,
  saveIntegrityRecords,
  loadIntegrityRecords,
  verifySnapshotIntegrity,
} from "./integrity.js";

/** 快照文件前缀 */
const SNAPSHOT_PREFIX = "snapshot-";
/** 快照文件后缀 */
const SNAPSHOT_SUFFIX = ".json";
/** 临时文件后缀 */
const TMP_SUFFIX = ".tmp";

/**
 * 生成快照文件名
 */
function snapshotFileName(snapshotId: string): string {
  return `${SNAPSHOT_PREFIX}${snapshotId}${SNAPSHOT_SUFFIX}`;
}

/**
 * 从文件名提取 snapshotId
 */
function extractSnapshotId(fileName: string): string | null {
  if (fileName.startsWith(SNAPSHOT_PREFIX) && fileName.endsWith(SNAPSHOT_SUFFIX)) {
    return fileName.slice(SNAPSHOT_PREFIX.length, -SNAPSHOT_SUFFIX.length);
  }
  return null;
}

/**
 * 获取状态目录的绝对路径
 */
function getStateDir(deps: PersistenceDeps): string {
  return join(deps.workspacePath, deps.config.snapshotDir);
}

/**
 * 创建持久化管理器
 */
export function createPersistenceManager(deps: PersistenceDeps): PersistenceManager {
  const config: PersistenceConfig = { ...DEFAULT_PERSISTENCE_CONFIG, ...deps.config };
  const stateDir = getStateDir(deps);

  async function ensureDir(): Promise<void> {
    await mkdir(stateDir, { recursive: true });
  }

  async function saveSnapshot(snapshot: SystemStateSnapshot): Promise<void> {
    await ensureDir();

    const fileName = snapshotFileName(snapshot.snapshotId);
    const filePath = join(stateDir, fileName);
    const tmpPath = filePath + TMP_SUFFIX;
    const data = serializeSnapshot(snapshot);

    // 原子写入：先写临时文件，再 rename
    await writeFile(tmpPath, data, "utf-8");
    await rename(tmpPath, filePath);

    // 更新完整性记录
    const records = await loadIntegrityRecords(stateDir);
    const newRecord = createIntegrityRecord(fileName, data);
    const updatedRecords = [...records.filter((r) => r.filePath !== fileName), newRecord];
    await saveIntegrityRecords(stateDir, updatedRecords);

    deps.logger.info("persistence", `快照已保存: ${fileName}`, {
      snapshotId: snapshot.snapshotId,
      trigger: snapshot.metadata.trigger,
    });
  }

  async function loadLatestSnapshot(): Promise<SystemStateSnapshot | null> {
    await ensureDir();

    const files = await listSnapshotFiles(stateDir);
    if (files.length === 0) return null;

    // 按文件名（包含 UUID，但我们按完整性记录的时间排序）
    const records = await loadIntegrityRecords(stateDir);
    const recordMap = new Map(records.map((r) => [r.filePath, r]));

    // 按时间戳降序排序，取最新的
    const sorted = files
      .map((f) => ({ file: f, record: recordMap.get(f) }))
      .filter((item) => item.record !== undefined)
      .sort((a, b) => {
        const timeA = new Date(a.record!.timestamp).getTime();
        const timeB = new Date(b.record!.timestamp).getTime();
        return timeB - timeA;
      });

    // 依次尝试加载，跳过损坏的
    for (const item of sorted) {
      const isValid = await verifySnapshotIntegrity(stateDir, item.file);
      if (!isValid) {
        deps.logger.warn("persistence", `快照完整性校验失败，跳过: ${item.file}`);
        continue;
      }

      try {
        const data = await readFile(join(stateDir, item.file), "utf-8");
        const snapshot = deserializeSnapshot(data);
        deps.logger.info("persistence", `已加载快照: ${item.file}`);
        return snapshot;
      } catch (err) {
        deps.logger.warn("persistence", `快照加载失败，跳过: ${item.file}`, { error: err });
      }
    }

    return null;
  }

  async function listSnapshots(): Promise<readonly IntegrityRecord[]> {
    await ensureDir();
    return loadIntegrityRecords(stateDir);
  }

  async function deleteSnapshot(snapshotId: string): Promise<void> {
    await ensureDir();

    const fileName = snapshotFileName(snapshotId);
    const filePath = join(stateDir, fileName);

    try {
      await unlink(filePath);
    } catch {
      // 文件不存在也视为删除成功
    }

    // 更新完整性记录
    const records = await loadIntegrityRecords(stateDir);
    const updatedRecords = records.filter((r) => r.filePath !== fileName);
    await saveIntegrityRecords(stateDir, updatedRecords);

    deps.logger.info("persistence", `快照已删除: ${snapshotId}`);
  }

  async function cleanup(): Promise<number> {
    await ensureDir();

    const records = await loadIntegrityRecords(stateDir);
    if (records.length <= config.maxSnapshots) return 0;

    // 按时间排序，保留最新的
    const sorted = [...records].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });

    const toDelete = sorted.slice(config.maxSnapshots);
    let deleted = 0;

    for (const record of toDelete) {
      try {
        await unlink(join(stateDir, record.filePath));
        deleted++;
      } catch {
        // 跳过已删除的文件
      }
    }

    // 更新完整性记录
    const remaining = sorted.slice(0, config.maxSnapshots);
    await saveIntegrityRecords(stateDir, remaining);

    if (deleted > 0) {
      deps.logger.info("persistence", `已清理 ${deleted} 个过期快照`);
    }

    return deleted;
  }

  function getConfig(): PersistenceConfig {
    return config;
  }

  return { saveSnapshot, loadLatestSnapshot, listSnapshots, deleteSnapshot, cleanup, getConfig };
}

/**
 * 列出状态目录中的快照文件名
 */
async function listSnapshotFiles(stateDir?: string): Promise<string[]> {
  if (!stateDir) return [];

  try {
    const entries = await readdir(stateDir);
    return entries.filter((f) => {
      const id = extractSnapshotId(f);
      return id !== null;
    });
  } catch {
    return [];
  }
}

// 重载：内部使用时需传 stateDir
export { listSnapshotFiles };
