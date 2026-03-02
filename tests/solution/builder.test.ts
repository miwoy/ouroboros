/**
 * Agent 构建器测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildAgent, loadAgent, listAgents } from "../../src/solution/builder.js";
import { initWorkspace } from "../../src/workspace/init.js";
import type { SolutionDefinition } from "../../src/solution/types.js";
import { EntityStatus, EntityType } from "../../src/tool/types.js";

describe("Agent 构建器", () => {
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
    identityPrompt: `你是一个 ${name}`,
    skills: ["skill:read-file"],
    interaction: {
      multiTurn: true,
      humanInLoop: false,
      inputModes: ["text"],
      outputModes: ["text"],
    },
    workspacePath: `agents/${name}/workspace`,
    memory: { shortTerm: true, longTerm: true, hotSessionMaxTokens: 2000 },
    knowledge: { maxTokens: 4000 },
  });

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "builder-"));
    await initWorkspace(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("buildAgent", () => {
    it("应创建 Agent 目录结构", async () => {
      const agent = await buildAgent(makeSolution("test-agent"), tmpDir);

      // 检查目录存在
      await expect(access(join(tmpDir, "agents", "test-agent"))).resolves.not.toThrow();
      await expect(
        access(join(tmpDir, "agents", "test-agent", "workspace", "prompts")),
      ).resolves.not.toThrow();
    });

    it("应写入 config.json", async () => {
      await buildAgent(makeSolution("cfg-agent"), tmpDir);

      const configPath = join(tmpDir, "agents", "cfg-agent", "config.json");
      const raw = await readFile(configPath, "utf-8");
      const config = JSON.parse(raw);
      expect(config.id).toBe("solution:cfg-agent");
      expect(config.identityPrompt).toContain("cfg-agent");
    });

    it("应写入 metadata.json", async () => {
      await buildAgent(makeSolution("meta-agent"), tmpDir);

      const metaPath = join(tmpDir, "agents", "meta-agent", "metadata.json");
      const raw = await readFile(metaPath, "utf-8");
      const meta = JSON.parse(raw);
      expect(meta.agentId).toBe("solution:meta-agent");
      expect(meta.name).toBe("meta-agent");
      expect(meta.createdAt).toBeTruthy();
    });

    it("应返回完整的 Agent 实例", async () => {
      const agent = await buildAgent(makeSolution("full-agent"), tmpDir);

      expect(agent.id).toBe("solution:full-agent");
      expect(agent.name).toBe("full-agent");
      expect(agent.definition.identityPrompt).toContain("full-agent");
      expect(agent.memoryManager).toBeDefined();
      expect(agent.knowledgeBase).toBeDefined();
      expect(agent.createdAt).toBeTruthy();
    });

    it("应使用 Solution 的记忆配置", async () => {
      const agent = await buildAgent(makeSolution("mem-agent"), tmpDir);
      expect(agent.memoryManager.config.hotSessionMaxTokens).toBe(2000);
    });
  });

  describe("loadAgent", () => {
    it("应加载已创建的 Agent", async () => {
      await buildAgent(makeSolution("load-test"), tmpDir);

      const loaded = await loadAgent("load-test", tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe("solution:load-test");
      expect(loaded!.definition.identityPrompt).toContain("load-test");
    });

    it("不存在的 Agent 应返回 null", async () => {
      const loaded = await loadAgent("nonexistent", tmpDir);
      expect(loaded).toBeNull();
    });
  });

  describe("listAgents", () => {
    it("应列出所有 Agent", async () => {
      await buildAgent(makeSolution("agent-a"), tmpDir);
      await buildAgent(makeSolution("agent-b"), tmpDir);

      const agents = await listAgents(tmpDir);
      expect(agents).toContain("agent-a");
      expect(agents).toContain("agent-b");
      expect(agents).toHaveLength(2);
    });

    it("无 Agent 时应返回空数组", async () => {
      const agents = await listAgents(tmpDir);
      expect(agents).toEqual([]);
    });
  });
});
