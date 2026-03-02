/**
 * 技能注册表单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSkillRegistry } from "../../src/skill/registry.js";
import { EntityStatus } from "../../src/skill/types.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "ouroboros-skill-registry-"));
  await mkdir(join(tmpDir, "prompts"), { recursive: true });
  await mkdir(join(tmpDir, "skills"), { recursive: true });

  // 创建 skill.md
  const skillContent = [
    "---",
    "type: skill",
    'name: "技能注册表"',
    'description: "技能注册表"',
    'version: "1.0.0"',
    "---",
    "| 名称 | ID | 描述 | 路径 |",
  ].join("\n");
  await writeFile(join(tmpDir, "prompts", "skill.md"), skillContent, "utf-8");
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("createSkillRegistry", () => {
  it("应注册内置技能", async () => {
    const registry = await createSkillRegistry(tmpDir);
    expect(registry.has("skill:create-solution")).toBe(true);
  });

  it("应列出所有技能", async () => {
    const registry = await createSkillRegistry(tmpDir);
    const all = registry.list();
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all.some((s) => s.id === "skill:create-solution")).toBe(true);
  });

  it("应按 origin 过滤技能", async () => {
    const registry = await createSkillRegistry(tmpDir);
    const systemSkills = registry.listByOrigin("system");
    expect(systemSkills.every((s) => s.origin === "system")).toBe(true);
    const userSkills = registry.listByOrigin("user");
    expect(userSkills.every((s) => s.origin === "user")).toBe(true);
  });

  it("应加载 workspace/skills/ 中的用户技能", async () => {
    const skillContent = [
      "---",
      "type: skill",
      'name: "测试技能"',
      'description: "测试用技能"',
      'version: "1.0.0"',
      "---",
      "这是测试技能模板 {{input}}",
    ].join("\n");
    await writeFile(join(tmpDir, "skills", "test-skill.md"), skillContent, "utf-8");

    const registry = await createSkillRegistry(tmpDir);
    expect(registry.has("skill:test-skill")).toBe(true);

    const skill = registry.get("skill:test-skill")!;
    expect(skill.name).toBe("测试技能");
    expect(skill.description).toBe("测试用技能");
    expect(skill.origin).toBe("user");
    expect(skill.promptTemplate).toContain("{{input}}");
  });

  it("非 skill 类型的 .md 文件应被忽略", async () => {
    const content = [
      "---",
      "type: tool",
      'name: "不是技能"',
      'description: "这不是技能"',
      'version: "1.0.0"',
      "---",
      "content",
    ].join("\n");
    await writeFile(join(tmpDir, "skills", "not-skill.md"), content, "utf-8");

    const registry = await createSkillRegistry(tmpDir);
    expect(registry.has("skill:not-skill")).toBe(false);
  });

  it("目录不存在时应正常初始化", async () => {
    await rm(join(tmpDir, "skills"), { recursive: true, force: true });
    const registry = await createSkillRegistry(tmpDir);
    expect(registry.list().length).toBeGreaterThanOrEqual(1); // 至少有内置技能
  });
});

describe("register", () => {
  it("应注册用户技能并追加 skill.md", async () => {
    const registry = await createSkillRegistry(tmpDir);
    const now = new Date().toISOString();

    await registry.register({
      id: "skill:custom-test",
      type: "skill",
      name: "自定义测试",
      description: "测试注册",
      tags: ["test"],
      version: "1.0.0",
      status: EntityStatus.Active,
      permissions: {},
      origin: "user",
      createdAt: now,
      updatedAt: now,
      promptTemplate: "测试 {{var1}}",
      requiredTools: [],
      inputDescription: "输入描述",
      outputDescription: "输出描述",
    });

    expect(registry.has("skill:custom-test")).toBe(true);

    // 验证 skill.md 被追加
    const skillMdContent = await readFile(join(tmpDir, "prompts", "skill.md"), "utf-8");
    expect(skillMdContent).toContain("自定义测试");
    expect(skillMdContent).toContain("skill:custom-test");
  });

  it("内置技能注册不应追加 skill.md", async () => {
    const registry = await createSkillRegistry(tmpDir);
    const before = await readFile(join(tmpDir, "prompts", "skill.md"), "utf-8");

    await registry.register({
      id: "skill:system-test",
      type: "skill",
      name: "系统测试",
      description: "系统技能测试",
      tags: [],
      version: "1.0.0",
      status: EntityStatus.Active,
      permissions: {},
      origin: "system",
      createdAt: "",
      updatedAt: "",
      promptTemplate: "",
      requiredTools: [],
      inputDescription: "",
      outputDescription: "",
    });

    const after = await readFile(join(tmpDir, "prompts", "skill.md"), "utf-8");
    expect(after).toBe(before);
  });
});

describe("updateStatus", () => {
  it("应更新技能状态", async () => {
    const registry = await createSkillRegistry(tmpDir);
    const updated = await registry.updateStatus("skill:create-solution", EntityStatus.Deprecated);
    expect(updated.status).toBe(EntityStatus.Deprecated);
    expect(registry.get("skill:create-solution")?.status).toBe(EntityStatus.Deprecated);
  });

  it("不存在的技能应抛出错误", async () => {
    const registry = await createSkillRegistry(tmpDir);
    await expect(registry.updateStatus("skill:nonexistent", EntityStatus.Active)).rejects.toThrow("不存在");
  });
});
