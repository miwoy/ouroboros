/**
 * 激素系统 — 影响 Agent 决策倾向
 *
 * 三个激素指标：
 * - focusLevel（专注度）：影响任务聚焦程度
 * - cautionLevel（谨慎度）：影响风险规避倾向
 * - creativityLevel（创造力）：影响发散思维程度
 *
 * 数值范围 0-100，默认值 50。
 * 审查程序和反思程序可根据执行状态动态调整。
 */

import type { HormoneState, HormoneDefaults, HormoneManager } from "./types.js";

/** 默认激素值 */
const DEFAULT_HORMONES: HormoneDefaults = {
  focusLevel: 60,
  cautionLevel: 50,
  creativityLevel: 50,
};

/**
 * 创建激素管理器
 */
export function createHormoneManager(defaults?: Partial<HormoneDefaults>): HormoneManager {
  let state: HormoneState = {
    focusLevel: defaults?.focusLevel ?? DEFAULT_HORMONES.focusLevel,
    cautionLevel: defaults?.cautionLevel ?? DEFAULT_HORMONES.cautionLevel,
    creativityLevel: defaults?.creativityLevel ?? DEFAULT_HORMONES.creativityLevel,
  };

  const initial = { ...state };

  return {
    getState(): HormoneState {
      return state;
    },

    adjustFocus(delta: number): void {
      state = { ...state, focusLevel: clamp(state.focusLevel + delta) };
    },

    adjustCaution(delta: number): void {
      state = { ...state, cautionLevel: clamp(state.cautionLevel + delta) };
    },

    adjustCreativity(delta: number): void {
      state = { ...state, creativityLevel: clamp(state.creativityLevel + delta) };
    },

    reset(): void {
      state = { ...initial };
    },
  };
}

/**
 * 根据执行状态自动调整激素
 */
export function adjustHormonesForEvent(
  manager: HormoneManager,
  event: "loop-detected" | "tool-failure" | "task-completed" | "task-failed",
): void {
  switch (event) {
    case "loop-detected":
      manager.adjustCaution(15);
      manager.adjustFocus(10);
      manager.adjustCreativity(-10);
      break;
    case "tool-failure":
      manager.adjustCaution(5);
      break;
    case "task-completed":
      manager.adjustFocus(-5);
      manager.adjustCreativity(5);
      break;
    case "task-failed":
      manager.adjustCaution(10);
      manager.adjustCreativity(-5);
      break;
  }
}

/** 将数值限制在 0-100 */
function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
