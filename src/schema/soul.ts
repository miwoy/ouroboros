/**
 * Soul Schema — World Model & Self Awareness
 *
 * Defines the agent's behavioral boundaries, world understanding,
 * and self-awareness. Loaded from workspace/prompts/self.md or defaults.
 */

import type { SoulSchema, WorldModel, SelfAwareness } from "./types.js";

/** Default world model */
const DEFAULT_WORLD_MODEL: WorldModel = {
  rules: [
    "Follow user instructions within safety boundaries",
    "Acquire information only through tools — never fabricate facts",
    "Acknowledge uncertainty; ask for clarification when needed",
    "Prepare fallback plans — tools can fail, systems can timeout",
    "Minimize side-effects; prefer read before write, ask before delete",
  ],
  constraints: [
    "Never produce harmful, deceptive, or policy-violating content",
    "Never execute destructive operations without explicit user confirmation",
    "Never access resources outside the authorized scope",
    "Never retain sensitive information beyond the current session",
    "Never silently modify system configuration",
  ],
  knowledge:
    "Retrieve information through tools and knowledge bases. Do not rely on stale training data.",
};

/** Default self awareness */
const DEFAULT_SELF_AWARENESS: SelfAwareness = {
  identity:
    "I am Ouroboros — a self-referential agent that creates tools, skills, and sub-agents to solve problems.",
  purpose:
    "Solve user tasks through iterative reasoning (ReAct), tool orchestration, and agent coordination.",
  capabilities: [
    "Execute registered tools (file I/O, shell, web, model calls)",
    "Create new tools and skills on the fly",
    "Spawn and coordinate sub-agents",
    "Maintain short-term and long-term memory",
    "Self-reflect and optimize strategies",
  ],
  limitations: [
    "Bound by available tools and knowledge bases",
    "Internet access only through web tools",
    "Finite compute resources — plan accordingly",
    "No real-time sensory perception",
  ],
};

/**
 * Get the default soul schema
 */
export function getDefaultSoulSchema(): SoulSchema {
  return {
    worldModel: DEFAULT_WORLD_MODEL,
    selfAwareness: DEFAULT_SELF_AWARENESS,
  };
}

/**
 * Create a custom soul schema (merging with defaults)
 */
export function createSoulSchema(
  worldModel?: Partial<WorldModel>,
  selfAwareness?: Partial<SelfAwareness>,
): SoulSchema {
  return {
    worldModel: {
      rules: worldModel?.rules ?? DEFAULT_WORLD_MODEL.rules,
      constraints: worldModel?.constraints ?? DEFAULT_WORLD_MODEL.constraints,
      knowledge: worldModel?.knowledge ?? DEFAULT_WORLD_MODEL.knowledge,
    },
    selfAwareness: {
      identity: selfAwareness?.identity ?? DEFAULT_SELF_AWARENESS.identity,
      purpose: selfAwareness?.purpose ?? DEFAULT_SELF_AWARENESS.purpose,
      capabilities: selfAwareness?.capabilities ?? DEFAULT_SELF_AWARENESS.capabilities,
      limitations: selfAwareness?.limitations ?? DEFAULT_SELF_AWARENESS.limitations,
    },
  };
}

/**
 * Format world model as prompt text
 */
export function formatWorldModel(model: WorldModel): string {
  const parts: string[] = [];

  parts.push("#### World Rules");
  for (const rule of model.rules) {
    parts.push(`- ${rule}`);
  }

  parts.push("\n#### Constraints");
  for (const c of model.constraints) {
    parts.push(`- ${c}`);
  }

  parts.push(`\n#### Knowledge\n${model.knowledge}`);

  return parts.join("\n");
}

/**
 * Format self awareness as prompt text
 */
export function formatSelfAwareness(awareness: SelfAwareness): string {
  const parts: string[] = [];

  parts.push(`**Identity**: ${awareness.identity}`);
  parts.push(`**Purpose**: ${awareness.purpose}`);

  parts.push("\n**Capabilities**:");
  for (const cap of awareness.capabilities) {
    parts.push(`- ${cap}`);
  }

  parts.push("\n**Limitations**:");
  for (const lim of awareness.limitations) {
    parts.push(`- ${lim}`);
  }

  return parts.join("\n");
}
