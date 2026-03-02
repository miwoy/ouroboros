/**
 * Solution 注册表测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSolutionRegistry } from "../../src/solution/registry.js";
import type { SolutionDefinition } from "../../src/solution/types.js";
import { EntityStatus, EntityType } from "../../src/tool/types.js";

describe("createSolutionRegistry", () => {
  let tmpDir: string;

  const makeSolution = (name: string): SolutionDefinition => ({
    id: `solution:${name}`,
    type: EntityType.Solution,
    name,
    description: `${name} Agent`,
    tags: ["test"],
    version: "1.0.0",
    status: EntityStatus.Active,
    permissions: {},
    origin: "user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    identityPrompt: `你是 ${name}`,
    skills: [],
    interaction: {
      multiTurn: true,
      humanInLoop: false,
      inputModes: ["text"],
      outputModes: ["text"],
    },
    workspacePath: `workspace/agents/${name}`,
  });

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "sol-reg-"));
    await mkdir(join(tmpDir, "prompts"), { recursive: true });
    await mkdir(join(tmpDir, "solutions"), { recursive: true });
    // 创建 agent.md
    const agentMd = [
      "---",
      "type: agent",
      'name: "Agent 注册表"',
      'description: "已定义的 Agent 列表"',
      'version: "1.0.0"',
      "---",
      "",
      "| 名称 | ID | 描述 | 路径 |",
    ].join("\n");
    await writeFile(join(tmpDir, "prompts", "agent.md"), agentMd, "utf-8");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("初始状态应为空", async () => {
    const registry = await createSolutionRegistry(tmpDir);
    expect(registry.list()).toEqual([]);
  });

  it("应注册并获取 Solution", async () => {
    const registry = await createSolutionRegistry(tmpDir);
    const solution = makeSolution("code-reviewer");
    await registry.register(solution);

    expect(registry.has("solution:code-reviewer")).toBe(true);
    expect(registry.get("solution:code-reviewer")?.name).toBe("code-reviewer");
  });

  it("应持久化到 registry.json", async () => {
    const registry = await createSolutionRegistry(tmpDir);
    await registry.register(makeSolution("test-agent"));

    const raw = await readFile(join(tmpDir, "solutions", "registry.json"), "utf-8");
    const data = JSON.parse(raw);
    expect(data.solutions).toHaveLength(1);
    expect(data.solutions[0].id).toBe("solution:test-agent");
  });

  it("应从已有 registry.json 加载", async () => {
    // 先注册
    const reg1 = await createSolutionRegistry(tmpDir);
    await reg1.register(makeSolution("agent-a"));
    await reg1.register(makeSolution("agent-b"));

    // 重新加载
    const reg2 = await createSolutionRegistry(tmpDir);
    expect(reg2.list()).toHaveLength(2);
    expect(reg2.has("solution:agent-a")).toBe(true);
    expect(reg2.has("solution:agent-b")).toBe(true);
  });

  it("应按 origin 筛选", async () => {
    const registry = await createSolutionRegistry(tmpDir);
    await registry.register(makeSolution("user-agent"));
    const systemSolution = { ...makeSolution("sys-agent"), origin: "system" as const };
    await registry.register(systemSolution);

    expect(registry.listByOrigin("user")).toHaveLength(1);
    expect(registry.listByOrigin("system")).toHaveLength(1);
  });

  it("应更新 Solution 状态", async () => {
    const registry = await createSolutionRegistry(tmpDir);
    await registry.register(makeSolution("to-deprecate"));

    const updated = await registry.updateStatus("solution:to-deprecate", EntityStatus.Deprecated);
    expect(updated.status).toBe("deprecated");
    expect(registry.get("solution:to-deprecate")?.status).toBe("deprecated");
  });

  it("更新不存在的 Solution 应抛出错误", async () => {
    const registry = await createSolutionRegistry(tmpDir);
    await expect(
      registry.updateStatus("solution:nonexistent", EntityStatus.Active),
    ).rejects.toThrow("不存在");
  });

  it("应追加到 agent.md", async () => {
    const registry = await createSolutionRegistry(tmpDir);
    await registry.register(makeSolution("my-agent"));

    const agentMd = await readFile(join(tmpDir, "prompts", "agent.md"), "utf-8");
    expect(agentMd).toContain("my-agent");
    expect(agentMd).toContain("solution:my-agent");
  });

  it("get 不存在的 Solution 应返回 undefined", async () => {
    const registry = await createSolutionRegistry(tmpDir);
    expect(registry.get("solution:nonexistent")).toBeUndefined();
  });

  it("has 不存在的 Solution 应返回 false", async () => {
    const registry = await createSolutionRegistry(tmpDir);
    expect(registry.has("solution:nonexistent")).toBe(false);
  });
});
