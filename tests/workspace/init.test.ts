import { describe, it, expect, afterEach } from "vitest";
import { rm, stat, readFile } from "node:fs/promises";
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
      "prompts/memory",
      "tools",
      "tools/scripts",
      "skills",
      "agents",
      "solutions",
      "super-agents",
      "logs",
      "tmp",
      "vectors",
    ];
    expect(created).toHaveLength(expectedDirs.length);

    for (const dir of expectedDirs) {
      const dirStat = await stat(join(TEST_WORKSPACE, dir));
      expect(dirStat.isDirectory()).toBe(true);
    }
  });

  it("应该复制默认模板文件到 prompts/", async () => {
    await initWorkspace(TEST_WORKSPACE);

    // 检查模板文件是否存在
    const expectedFiles = ["self.md", "tool.md", "skill.md", "agent.md", "memory.md"];
    for (const file of expectedFiles) {
      const fileStat = await stat(join(TEST_WORKSPACE, "prompts", file));
      expect(fileStat.isFile()).toBe(true);
    }
  });

  it("不应复制 core.md 到 workspace", async () => {
    await initWorkspace(TEST_WORKSPACE);

    // core.md 不应存在于 workspace/prompts/
    await expect(stat(join(TEST_WORKSPACE, "prompts", "core.md"))).rejects.toThrow();
  });

  it("不应有旧的分类子目录", async () => {
    await initWorkspace(TEST_WORKSPACE);

    // 旧的分类子目录不应存在
    const oldDirs = [
      "prompts/system",
      "prompts/agents",
      "prompts/skills",
      "prompts/tools",
      "prompts/schema",
      "prompts/core",
    ];
    for (const dir of oldDirs) {
      await expect(stat(join(TEST_WORKSPACE, dir))).rejects.toThrow();
    }
  });

  it("应该创建空的 tools/registry.json", async () => {
    await initWorkspace(TEST_WORKSPACE);

    const registryPath = join(TEST_WORKSPACE, "tools", "registry.json");
    const content = await readFile(registryPath, "utf-8");
    const data = JSON.parse(content);
    expect(data.version).toBe("1.0.0");
    expect(data.tools).toEqual([]);
  });

  it("重复调用不应报错（幂等）", async () => {
    await initWorkspace(TEST_WORKSPACE);
    await expect(initWorkspace(TEST_WORKSPACE)).resolves.toBeDefined();
  });

  it("重复调用不应覆盖用户修改的文件", async () => {
    await initWorkspace(TEST_WORKSPACE);

    // 修改 skill.md
    const skillPath = join(TEST_WORKSPACE, "prompts", "skill.md");
    const { writeFile: fsWrite } = await import("node:fs/promises");
    await fsWrite(skillPath, "用户自定义内容", "utf-8");

    // 再次初始化
    await initWorkspace(TEST_WORKSPACE);

    // 用户修改应保留
    const content = await readFile(skillPath, "utf-8");
    expect(content).toBe("用户自定义内容");
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
      "prompts/memory",
      "tools",
      "tools/scripts",
      "skills",
      "logs",
      "tmp",
      "vectors",
    ];
    for (const dir of expectedDirs) {
      const dirStat = await stat(join(agentRoot, dir));
      expect(dirStat.isDirectory()).toBe(true);
    }
  });

  it("应该为 Agent workspace 复制默认模板", async () => {
    const agentRoot = await initAgentWorkspace(TEST_WORKSPACE, "test-agent");

    const expectedFiles = ["self.md", "tool.md", "skill.md", "agent.md", "memory.md"];
    for (const file of expectedFiles) {
      const fileStat = await stat(join(agentRoot, "prompts", file));
      expect(fileStat.isFile()).toBe(true);
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
