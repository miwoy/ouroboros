/**
 * Super Agent 构建器测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSuperAgent, loadSuperAgent } from "../../src/super-agent/builder.js";
import type { SuperAgentDefinition } from "../../src/super-agent/types.js";
import { EntityStatus, EntityType } from "../../src/tool/types.js";

describe("Super Agent 构建器", () => {
  let tmpDir: string;

  const makeDefinition = (name: string): SuperAgentDefinition => ({
    id: `super-agent:${name}`,
    type: EntityType.Solution,
    name,
    description: `${name} Super Agent`,
    tags: ["test"],
    version: "1.0.0",
    status: EntityStatus.Active,
    permissions: {},
    origin: "user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    responsibilityPrompt: `负责 ${name} 领域`,
    agents: [
      {
        roleName: "researcher",
        responsibility: "调研信息",
        agentId: "solution:researcher",
      },
      {
        roleName: "writer",
        responsibility: "撰写内容",
        agentId: "solution:writer",
        dependsOn: ["researcher"],
      },
    ],
    collaboration: {
      mode: "sequential",
      conflictResolution: { strategy: "orchestrator-decides", timeout: 60 },
    },
    workspacePath: `workspace/super-agents/${name}`,
  });

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "sa-build-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("buildSuperAgent", () => {
    it("应创建 Super Agent 目录结构", async () => {
      const definition = makeDefinition("blog");
      const instance = await buildSuperAgent(definition, tmpDir);

      // 验证目录存在
      await expect(access(join(tmpDir, "super-agents", "blog"))).resolves.toBeUndefined();
      await expect(access(instance.workspacePath)).resolves.toBeUndefined();
      await expect(access(join(instance.workspacePath, "results"))).resolves.toBeUndefined();
    });

    it("应写入 config.json", async () => {
      const definition = makeDefinition("blog");
      await buildSuperAgent(definition, tmpDir);

      const raw = await readFile(
        join(tmpDir, "super-agents", "blog", "config.json"),
        "utf-8",
      );
      const config = JSON.parse(raw);
      expect(config.id).toBe("super-agent:blog");
      expect(config.agents).toHaveLength(2);
    });

    it("应写入 metadata.json", async () => {
      const definition = makeDefinition("blog");
      await buildSuperAgent(definition, tmpDir);

      const raw = await readFile(
        join(tmpDir, "super-agents", "blog", "metadata.json"),
        "utf-8",
      );
      const meta = JSON.parse(raw);
      expect(meta.superAgentId).toBe("super-agent:blog");
      expect(meta.name).toBe("blog");
      expect(meta.roles).toEqual(["researcher", "writer"]);
      expect(meta.collaborationMode).toBe("sequential");
    });

    it("应返回正确的实例信息", async () => {
      const definition = makeDefinition("blog");
      const instance = await buildSuperAgent(definition, tmpDir);

      expect(instance.id).toBe("super-agent:blog");
      expect(instance.name).toBe("blog");
      expect(instance.definition).toBe(definition);
      expect(instance.memoryManager).toBeDefined();
      expect(instance.createdAt).toBeTruthy();
    });

    it("应从 ID 提取名称（去除前缀）", async () => {
      const definition = makeDefinition("my-project");
      const instance = await buildSuperAgent(definition, tmpDir);

      expect(instance.name).toBe("my-project");
    });
  });

  describe("loadSuperAgent", () => {
    it("应加载已有的 Super Agent", async () => {
      const definition = makeDefinition("existing");
      const original = await buildSuperAgent(definition, tmpDir);

      const loaded = await loadSuperAgent("existing", tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe("super-agent:existing");
      expect(loaded!.name).toBe("existing");
      expect(loaded!.createdAt).toBe(original.createdAt);
    });

    it("不存在时应返回 null", async () => {
      const loaded = await loadSuperAgent("nonexistent", tmpDir);
      expect(loaded).toBeNull();
    });

    it("加载的实例应包含 memoryManager", async () => {
      const definition = makeDefinition("with-memory");
      await buildSuperAgent(definition, tmpDir);

      const loaded = await loadSuperAgent("with-memory", tmpDir);
      expect(loaded!.memoryManager).toBeDefined();
    });

    it("metadata.json 不存在时应使用当前时间", async () => {
      const definition = makeDefinition("no-meta");
      await buildSuperAgent(definition, tmpDir);

      // 删除 metadata.json
      const { unlink } = await import("node:fs/promises");
      await unlink(join(tmpDir, "super-agents", "no-meta", "metadata.json"));

      const loaded = await loadSuperAgent("no-meta", tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.createdAt).toBeTruthy();
    });
  });
});
