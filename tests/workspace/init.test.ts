import { describe, it, expect, afterEach } from "vitest";
import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { initWorkspace, initAgentWorkspace } from "../../src/workspace/init.js";

const TEST_WORKSPACE = join(process.cwd(), ".test-workspace-tmp");

describe("initWorkspace", () => {
  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("应该创建所有必需的子目录", async () => {
    const created = await initWorkspace(TEST_WORKSPACE);

    const expectedDirs = [
      "prompts",
      "prompts/system",
      "prompts/agents",
      "prompts/skills",
      "prompts/tools",
      "prompts/memory",
      "prompts/schema",
      "prompts/core",
      "tools",
      "skills",
      "agents",
      "logs",
      "memory",
      "tmp",
      "vectors",
    ];
    expect(created).toHaveLength(expectedDirs.length);

    for (const dir of expectedDirs) {
      const dirStat = await stat(join(TEST_WORKSPACE, dir));
      expect(dirStat.isDirectory()).toBe(true);
    }
  });

  it("重复调用不应报错（幂等）", async () => {
    await initWorkspace(TEST_WORKSPACE);
    await expect(initWorkspace(TEST_WORKSPACE)).resolves.toBeDefined();
  });
});

describe("initAgentWorkspace", () => {
  afterEach(async () => {
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("应该为 Agent 创建独立的工作空间", async () => {
    const agentRoot = await initAgentWorkspace(TEST_WORKSPACE, "test-agent");

    expect(agentRoot).toContain("agents/test-agent/workspace");

    const expectedDirs = [
      "prompts",
      "prompts/system",
      "prompts/agents",
      "prompts/skills",
      "prompts/tools",
      "prompts/memory",
      "prompts/schema",
      "prompts/core",
      "tools",
      "skills",
      "logs",
      "memory",
      "tmp",
      "vectors",
    ];
    for (const dir of expectedDirs) {
      const dirStat = await stat(join(agentRoot, dir));
      expect(dirStat.isDirectory()).toBe(true);
    }
  });

  it("应该支持多个 Agent 各自独立的工作空间", async () => {
    const root1 = await initAgentWorkspace(TEST_WORKSPACE, "agent-a");
    const root2 = await initAgentWorkspace(TEST_WORKSPACE, "agent-b");

    expect(root1).not.toBe(root2);
    expect(root1).toContain("agent-a");
    expect(root2).toContain("agent-b");
  });
});
