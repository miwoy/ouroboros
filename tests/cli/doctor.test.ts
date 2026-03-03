import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock 模块
vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("../../src/config/resolver.js", () => ({
  resolveConfigPath: vi.fn(),
  expandTilde: vi.fn((p: string) => p.replace("~", "/home/test")),
  OUROBOROS_HOME: "~/.ouroboros",
}));

vi.mock("@mariozechner/pi-ai", () => ({}));

import { access, readFile } from "node:fs/promises";
import { resolveConfigPath } from "../../src/config/resolver.js";

describe("doctor 命令", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("应该检测 Node.js 版本", async () => {
    vi.mocked(resolveConfigPath).mockResolvedValue(null);
    vi.mocked(access).mockRejectedValue(new Error("not found"));
    vi.mocked(readFile).mockRejectedValue(new Error("not found"));

    const { runDoctor } = await import("../../src/cli/commands/doctor.js");
    await runDoctor();

    const logs = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const nodeCheck = logs.find((l) => typeof l === "string" && l.includes("Node.js 版本"));
    expect(nodeCheck).toBeDefined();
    expect(nodeCheck).toContain("[OK]");
  });

  it("应该在找到配置文件时显示 OK", async () => {
    vi.mocked(resolveConfigPath).mockResolvedValue({
      path: "/home/test/.ouroboros/config.json",
      source: "user" as const,
    });
    vi.mocked(readFile).mockImplementation(async (path) => {
      if (typeof path === "string" && path.endsWith("config.json")) {
        return '{"system":{}}';
      }
      throw new Error("not found");
    });
    vi.mocked(access).mockRejectedValue(new Error("not found"));

    const { runDoctor } = await import("../../src/cli/commands/doctor.js");
    await runDoctor();

    const logs = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const configCheck = logs.find((l) => typeof l === "string" && l.includes("配置文件"));
    expect(configCheck).toContain("[OK]");
  });

  it("应该在未找到配置文件时显示警告", async () => {
    vi.mocked(resolveConfigPath).mockResolvedValue(null);
    vi.mocked(access).mockRejectedValue(new Error("not found"));
    vi.mocked(readFile).mockRejectedValue(new Error("not found"));

    const { runDoctor } = await import("../../src/cli/commands/doctor.js");
    await runDoctor();

    const logs = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const configCheck = logs.find((l) => typeof l === "string" && l.includes("配置文件"));
    expect(configCheck).toContain("[!!]");
  });

  it("应该检查用户数据目录", async () => {
    vi.mocked(resolveConfigPath).mockResolvedValue(null);
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(readFile).mockRejectedValue(new Error("not found"));

    const { runDoctor } = await import("../../src/cli/commands/doctor.js");
    await runDoctor();

    const logs = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const dirCheck = logs.find((l) => typeof l === "string" && l.includes("用户数据目录"));
    expect(dirCheck).toContain("[OK]");
  });
});
