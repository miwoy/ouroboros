/**
 * 内置技能定义单元测试
 */

import { describe, it, expect } from "vitest";
import { getBuiltinSkillDefinitions, CREATE_SOLUTION_SKILL } from "../../src/skill/builtin/definitions.js";
import { EntityStatus } from "../../src/skill/types.js";

describe("getBuiltinSkillDefinitions", () => {
  it("应返回内置技能列表", () => {
    const skills = getBuiltinSkillDefinitions();
    expect(skills.length).toBeGreaterThanOrEqual(1);
  });

  it("所有内置技能应为 system origin", () => {
    const skills = getBuiltinSkillDefinitions();
    for (const skill of skills) {
      expect(skill.origin).toBe("system");
    }
  });

  it("所有内置技能应为 active 状态", () => {
    const skills = getBuiltinSkillDefinitions();
    for (const skill of skills) {
      expect(skill.status).toBe(EntityStatus.Active);
    }
  });

  it("所有内置技能 ID 应以 skill: 开头", () => {
    const skills = getBuiltinSkillDefinitions();
    for (const skill of skills) {
      expect(skill.id).toMatch(/^skill:/);
    }
  });
});

describe("CREATE_SOLUTION_SKILL", () => {
  it("应有正确的 ID", () => {
    expect(CREATE_SOLUTION_SKILL.id).toBe("skill:create-solution");
  });

  it("应包含 promptTemplate", () => {
    expect(CREATE_SOLUTION_SKILL.promptTemplate.length).toBeGreaterThan(0);
  });

  it("应声明 requirement 变量", () => {
    expect(CREATE_SOLUTION_SKILL.variables).toBeDefined();
    expect(CREATE_SOLUTION_SKILL.variables!.some((v) => v.name === "requirement")).toBe(true);
  });

  it("应声明 requiredTools", () => {
    expect(CREATE_SOLUTION_SKILL.requiredTools.length).toBeGreaterThan(0);
  });

  it("应有 inputDescription 和 outputDescription", () => {
    expect(CREATE_SOLUTION_SKILL.inputDescription.length).toBeGreaterThan(0);
    expect(CREATE_SOLUTION_SKILL.outputDescription.length).toBeGreaterThan(0);
  });

  it("应有使用示例", () => {
    expect(CREATE_SOLUTION_SKILL.examples).toBeDefined();
    expect(CREATE_SOLUTION_SKILL.examples!.length).toBeGreaterThan(0);
  });
});
