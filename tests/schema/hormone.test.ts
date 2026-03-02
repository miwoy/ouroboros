/**
 * 激素系统测试
 */

import { describe, it, expect } from "vitest";
import { createHormoneManager, adjustHormonesForEvent } from "../../src/schema/hormone.js";

describe("createHormoneManager", () => {
  it("应使用默认激素值", () => {
    const manager = createHormoneManager();
    const state = manager.getState();

    expect(state.focusLevel).toBe(60);
    expect(state.cautionLevel).toBe(50);
    expect(state.creativityLevel).toBe(50);
  });

  it("应使用自定义激素值", () => {
    const manager = createHormoneManager({
      focusLevel: 80,
      cautionLevel: 30,
      creativityLevel: 70,
    });
    const state = manager.getState();

    expect(state.focusLevel).toBe(80);
    expect(state.cautionLevel).toBe(30);
    expect(state.creativityLevel).toBe(70);
  });

  it("adjustFocus 应正确调整专注度", () => {
    const manager = createHormoneManager();
    manager.adjustFocus(10);
    expect(manager.getState().focusLevel).toBe(70);

    manager.adjustFocus(-20);
    expect(manager.getState().focusLevel).toBe(50);
  });

  it("adjustCaution 应正确调整谨慎度", () => {
    const manager = createHormoneManager();
    manager.adjustCaution(20);
    expect(manager.getState().cautionLevel).toBe(70);
  });

  it("adjustCreativity 应正确调整创造力", () => {
    const manager = createHormoneManager();
    manager.adjustCreativity(-10);
    expect(manager.getState().creativityLevel).toBe(40);
  });

  it("数值应限制在 0-100 范围内", () => {
    const manager = createHormoneManager({ focusLevel: 95, cautionLevel: 5, creativityLevel: 50 });
    manager.adjustFocus(20);
    expect(manager.getState().focusLevel).toBe(100); // 不超过 100

    manager.adjustCaution(-20);
    expect(manager.getState().cautionLevel).toBe(0); // 不低于 0
  });

  it("reset 应恢复到初始值", () => {
    const manager = createHormoneManager({ focusLevel: 80, cautionLevel: 30, creativityLevel: 70 });
    manager.adjustFocus(-30);
    manager.adjustCaution(40);

    manager.reset();
    const state = manager.getState();
    expect(state.focusLevel).toBe(80);
    expect(state.cautionLevel).toBe(30);
    expect(state.creativityLevel).toBe(70);
  });
});

describe("adjustHormonesForEvent", () => {
  it("死循环检测应增加谨慎度和专注度", () => {
    const manager = createHormoneManager();
    adjustHormonesForEvent(manager, "loop-detected");

    const state = manager.getState();
    expect(state.cautionLevel).toBeGreaterThan(50);
    expect(state.focusLevel).toBeGreaterThan(60);
    expect(state.creativityLevel).toBeLessThan(50);
  });

  it("工具失败应增加谨慎度", () => {
    const manager = createHormoneManager();
    adjustHormonesForEvent(manager, "tool-failure");

    expect(manager.getState().cautionLevel).toBeGreaterThan(50);
  });

  it("任务完成应减少专注度增加创造力", () => {
    const manager = createHormoneManager();
    adjustHormonesForEvent(manager, "task-completed");

    expect(manager.getState().focusLevel).toBeLessThan(60);
    expect(manager.getState().creativityLevel).toBeGreaterThan(50);
  });

  it("任务失败应增加谨慎度减少创造力", () => {
    const manager = createHormoneManager();
    adjustHormonesForEvent(manager, "task-failed");

    expect(manager.getState().cautionLevel).toBeGreaterThan(50);
    expect(manager.getState().creativityLevel).toBeLessThan(50);
  });
});
