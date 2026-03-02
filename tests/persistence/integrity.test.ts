import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  computeChecksum,
  verifyChecksum,
  createIntegrityRecord,
  saveIntegrityRecords,
  loadIntegrityRecords,
  verifySnapshotIntegrity,
} from "../../src/persistence/integrity.js";

describe("完整性校验", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `ouro-integrity-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("computeChecksum", () => {
    it("应返回一致的 SHA-256 校验和", () => {
      const data = '{"test": "value"}';
      const hash1 = computeChecksum(data);
      const hash2 = computeChecksum(data);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex = 64 字符
    });

    it("不同数据应返回不同校验和", () => {
      const hash1 = computeChecksum("data1");
      const hash2 = computeChecksum("data2");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("verifyChecksum", () => {
    it("数据匹配时返回 true", () => {
      const data = "test-data";
      const checksum = computeChecksum(data);
      expect(verifyChecksum(data, checksum)).toBe(true);
    });

    it("数据不匹配时返回 false", () => {
      const checksum = computeChecksum("original");
      expect(verifyChecksum("modified", checksum)).toBe(false);
    });
  });

  describe("createIntegrityRecord", () => {
    it("应创建完整的记录", () => {
      const data = '{"snapshot": true}';
      const record = createIntegrityRecord("test.json", data);

      expect(record.filePath).toBe("test.json");
      expect(record.checksum).toHaveLength(64);
      expect(record.fileSize).toBe(Buffer.byteLength(data, "utf-8"));
      expect(record.timestamp).toBeTruthy();
    });
  });

  describe("saveIntegrityRecords / loadIntegrityRecords", () => {
    it("应正确保存和加载记录", async () => {
      const records = [
        createIntegrityRecord("file1.json", "data1"),
        createIntegrityRecord("file2.json", "data2"),
      ];

      await saveIntegrityRecords(testDir, records);
      const loaded = await loadIntegrityRecords(testDir);

      expect(loaded).toHaveLength(2);
      expect(loaded[0].filePath).toBe("file1.json");
      expect(loaded[1].filePath).toBe("file2.json");
    });

    it("目录为空时返回空数组", async () => {
      const emptyDir = join(testDir, "empty");
      await mkdir(emptyDir);
      const loaded = await loadIntegrityRecords(emptyDir);
      expect(loaded).toEqual([]);
    });
  });

  describe("verifySnapshotIntegrity", () => {
    it("文件完好时返回 true", async () => {
      const data = '{"test": "snapshot"}';
      const fileName = "snapshot-test.json";
      await writeFile(join(testDir, fileName), data, "utf-8");

      const record = createIntegrityRecord(fileName, data);
      await saveIntegrityRecords(testDir, [record]);

      const result = await verifySnapshotIntegrity(testDir, fileName);
      expect(result).toBe(true);
    });

    it("文件被篡改时返回 false", async () => {
      const originalData = '{"test": "original"}';
      const fileName = "snapshot-tampered.json";
      await writeFile(join(testDir, fileName), originalData, "utf-8");

      const record = createIntegrityRecord(fileName, originalData);
      await saveIntegrityRecords(testDir, [record]);

      // 篡改文件
      await writeFile(join(testDir, fileName), '{"test": "tampered"}', "utf-8");

      const result = await verifySnapshotIntegrity(testDir, fileName);
      expect(result).toBe(false);
    });

    it("文件不存在时返回 false", async () => {
      const result = await verifySnapshotIntegrity(testDir, "nonexistent.json");
      expect(result).toBe(false);
    });

    it("无记录时返回 false", async () => {
      const fileName = "snapshot-no-record.json";
      await writeFile(join(testDir, fileName), "data", "utf-8");

      const result = await verifySnapshotIntegrity(testDir, fileName);
      expect(result).toBe(false);
    });
  });
});
