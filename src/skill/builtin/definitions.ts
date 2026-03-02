/**
 * 内置技能定义
 *
 * 系统内置技能，不可被用户修改。
 * - createSolution：创建 Agent 实例（阶段八完整实现）
 */

import { EntityStatus, type SkillDefinition } from "../types.js";

const now = "2026-01-01T00:00:00Z";

/** skill:create-solution — 创建 Agent 实例 */
export const CREATE_SOLUTION_SKILL: SkillDefinition = {
  id: "skill:create-solution",
  type: "skill",
  name: "创建解决方案",
  description: "创建新的 Agent 实例（Solution），定义其身份、知识库和技能组",
  tags: ["agent", "solution", "创建", "智能体"],
  version: "1.0.0",
  status: EntityStatus.Active,
  permissions: { createEntity: true, filesystem: ["workspace/agents/**"] },
  origin: "system",
  createdAt: now,
  updatedAt: now,
  promptTemplate: [
    "请根据以下需求创建一个新的 Agent 实例：",
    "",
    "## 需求描述",
    "{{requirement}}",
    "",
    "## 创建步骤",
    "1. 分析需求，确定 Agent 的身份定义、所需技能和知识库",
    "2. 使用 tool:write 创建 Agent 配置文件",
    "3. 注册 Agent 到 agent.md",
    "4. 返回创建结果",
  ].join("\n"),
  variables: [
    {
      name: "requirement",
      description: "Agent 需求描述（角色、能力、用途）",
      required: true,
    },
  ],
  requiredTools: ["tool:write", "tool:read", "tool:call-model"],
  inputDescription: "用户提供 Agent 需求描述（角色定义、所需能力、使用场景）",
  outputDescription: "创建完成的 Agent 配置信息，包括 ID、配置文件路径",
  estimatedDuration: 30,
  examples: [
    {
      input: "创建一个代码审查 Agent，能够分析代码质量并提出改进建议",
      expectedOutput: "Agent 'code-reviewer' 已创建，配置文件位于 workspace/agents/code-reviewer/",
    },
  ],
};

/** 获取所有内置技能定义 */
export function getBuiltinSkillDefinitions(): readonly SkillDefinition[] {
  return [CREATE_SOLUTION_SKILL];
}
