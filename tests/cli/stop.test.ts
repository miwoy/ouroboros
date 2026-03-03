import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock("../../src/config/resolver.js", () => ({
  expandTilde: vi.fn((p: string) => p.replace("~", "/home/test")),
  OUROBOROS_HOME: "~/.ouroboros",
}));

import { readFile, unlink } from "node:fs/promises";

describe("stop 命令", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("应该在无 PID 文件时提示未运行", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

    const { runStop } = await import("../../src/cli/commands/stop.js");
    await runStop();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("未在运行"),
    );
  });

  it("应该在 PID 文件内容无效时清理", async () => {
    vi.mocked(readFile).mockResolvedValue("not-a-number");
    vi.mocked(unlink).mockResolvedValue(undefined);

    const { runStop } = await import("../../src/cli/commands/stop.js");
    await runStop();

    expect(console.error).toHaveBeenCalledWith("PID 文件内容无效");
    expect(unlink).toHaveBeenCalled();
  });

  it("应该返回正确的 PID 文件路径", async () => {
    const { getPidPath } = await import("../../src/cli/commands/stop.js");
    const path = getPidPath();
    expect(path).toBe("/home/test/.ouroboros/ouroboros.pid");
  });
});
