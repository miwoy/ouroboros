/**
 * 状态文件完整性校验
 *
 * 使用 SHA-256 校验和验证快照文件完整性，
 * 防止损坏的状态文件导致恢复失败。
 */

import { createHash } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { IntegrityRecord } from "./types.js";

/** 完整性记录文件名 */
const INTEGRITY_FILE = ".integrity.json";

/**
 * 计算数据的 SHA-256 校验和
 */
export function computeChecksum(data: string): string {
  return createHash("sha256").update(data, "utf-8").digest("hex");
}

/**
 * 验证数据是否匹配预期校验和
 */
export function verifyChecksum(data: string, expectedChecksum: string): boolean {
  const actual = computeChecksum(data);
  return actual === expectedChecksum;
}

/**
 * 创建完整性记录
 */
export function createIntegrityRecord(
  filePath: string,
  data: string,
): IntegrityRecord {
  return {
    filePath,
    checksum: computeChecksum(data),
    fileSize: Buffer.byteLength(data, "utf-8"),
    timestamp: new Date().toISOString(),
  };
}

/**
 * 保存完整性记录到目录
 */
export async function saveIntegrityRecords(
  stateDir: string,
  records: readonly IntegrityRecord[],
): Promise<void> {
  const filePath = join(stateDir, INTEGRITY_FILE);
  const data = JSON.stringify(records, null, 2);
  await writeFile(filePath, data, "utf-8");
}

/**
 * 加载完整性记录
 */
export async function loadIntegrityRecords(
  stateDir: string,
): Promise<readonly IntegrityRecord[]> {
  const filePath = join(stateDir, INTEGRITY_FILE);
  try {
    const data = await readFile(filePath, "utf-8");
    return JSON.parse(data) as IntegrityRecord[];
  } catch {
    return [];
  }
}

/**
 * 验证快照文件完整性
 *
 * @param stateDir - 状态目录路径
 * @param snapshotFileName - 快照文件名
 * @returns 是否通过完整性校验
 */
export async function verifySnapshotIntegrity(
  stateDir: string,
  snapshotFileName: string,
): Promise<boolean> {
  const records = await loadIntegrityRecords(stateDir);
  const record = records.find((r) => r.filePath === snapshotFileName);
  if (!record) return false;

  try {
    const filePath = join(stateDir, snapshotFileName);
    const data = await readFile(filePath, "utf-8");

    // 校验文件大小
    const fileInfo = await stat(filePath);
    if (fileInfo.size !== record.fileSize) return false;

    // 校验 SHA-256
    return verifyChecksum(data, record.checksum);
  } catch {
    return false;
  }
}
