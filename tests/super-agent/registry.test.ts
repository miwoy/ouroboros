/**
 * Super Agent 注册表测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSuperAgentRegistry } from "../../src/super-agent/registry.js";
import type { SuperAgentDefinition } from "../../src/super-agent/types.js";
import { EntityStatus, EntityType } from "../../src/tool/types.js";

describe("createSuperAgentRegistry", () => {
  let tmpDir: string;

  const makeSuperAgent = (name: string): SuperAgentDefinition => ({
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
    responsibilityPrompt: `负责 ${name} 领域的协作`,
    agents: [
      {
        roleName: "worker",
        responsibility: "执行具体任务",
        agentId: "solution:worker",
      },
    ],
    collaboration: {
      mode: "sequential",
      conflictResolution: { strategy: "orchestrator-decides", timeout: 60 },
    },
    workspacePath: `workspace/super-agents/${name}`,
  });

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "sa-reg-"));
    await mkdir(join(tmpDir, "super-agents"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("初始状态应为空", async () => {
    const registry = await createSuperAgentRegistry(tmpDir);
    expect(registry.list()).toEqual([]);
  });

  it("应注册并获取 Super Agent", async () => {
    const registry = await createSuperAgentRegistry(tmpDir);
    const sa = makeSuperAgent("blog-writer");
    await registry.register(sa);

    expect(registry.has("super-agent:blog-writer")).toBe(true);
    expect(registry.get("super-agent:blog-writer")?.name).toBe("blog-writer");
  });

  it("应持久化到 registry.json", async () => {
    const registry = await createSuperAgentRegistry(tmpDir);
    await registry.register(makeSuperAgent("test-sa"));

    const raw = await readFile(join(tmpDir, "super-agents", "registry.json"), "utf-8");
    const data = JSON.parse(raw);
    expect(data.superAgents).toHaveLength(1);
    expect(data.superAgents[0].id).toBe("super-agent:test-sa");
  });

  it("应从已有 registry.json 加载", async () => {
    const reg1 = await createSuperAgentRegistry(tmpDir);
    await reg1.register(makeSuperAgent("sa-a"));
    await reg1.register(makeSuperAgent("sa-b"));

    const reg2 = await createSuperAgentRegistry(tmpDir);
    expect(reg2.list()).toHaveLength(2);
    expect(reg2.has("super-agent:sa-a")).toBe(true);
    expect(reg2.has("super-agent:sa-b")).toBe(true);
  });

  it("应按 origin 筛选", async () => {
    const registry = await createSuperAgentRegistry(tmpDir);
    await registry.register(makeSuperAgent("user-sa"));
    const systemSa = { ...makeSuperAgent("sys-sa"), origin: "system" as const };
    await registry.register(systemSa);

    expect(registry.listByOrigin("user")).toHaveLength(1);
    expect(registry.listByOrigin("system")).toHaveLength(1);
  });

  it("应更新 Super Agent 状态", async () => {
    const registry = await createSuperAgentRegistry(tmpDir);
    await registry.register(makeSuperAgent("to-deprecate"));

    const updated = await registry.updateStatus(
      "super-agent:to-deprecate",
      EntityStatus.Deprecated,
    );
    expect(updated.status).toBe("deprecated");
    expect(registry.get("super-agent:to-deprecate")?.status).toBe("deprecated");
  });

  it("更新不存在的 Super Agent 应抛出错误", async () => {
    const registry = await createSuperAgentRegistry(tmpDir);
    await expect(
      registry.updateStatus("super-agent:nonexistent", EntityStatus.Active),
    ).rejects.toThrow("不存在");
  });

  it("get 不存在的 Super Agent 应返回 undefined", async () => {
    const registry = await createSuperAgentRegistry(tmpDir);
    expect(registry.get("super-agent:nonexistent")).toBeUndefined();
  });

  it("has 不存在的 Super Agent 应返回 false", async () => {
    const registry = await createSuperAgentRegistry(tmpDir);
    expect(registry.has("super-agent:nonexistent")).toBe(false);
  });

  it("注册重复 ID 应覆盖", async () => {
    const registry = await createSuperAgentRegistry(tmpDir);
    await registry.register(makeSuperAgent("dup"));
    const updated = { ...makeSuperAgent("dup"), description: "updated desc" };
    await registry.register(updated);

    expect(registry.list()).toHaveLength(1);
    expect(registry.get("super-agent:dup")?.description).toBe("updated desc");
  });
});
