import { describe, it, expect, vi, beforeEach } from "vitest";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
  isQmdAvailable,
  initVectorIndex,
  updateVectorIndex,
  vectorSearch,
  removeVectorIndex,
  VectorIndexError,
} from "../../src/prompt/vector.js";

// Mock child_process.execFile
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

// Mock fs/promises（仅 mock readFile，其他保持原样）
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn() };
});

const mockExecFile = vi.mocked(execFile);
const mockReadFile = vi.mocked(readFile);

/** 构造 mock execFile 回调 */
function mockExecFileSuccess(stdout = ""): void {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: unknown, _opts: unknown, callback: unknown) => {
      (callback as (err: Error | null, stdout: string, stderr: string) => void)(null, stdout, "");
      return undefined as never;
    },
  );
}

function mockExecFileError(message: string): void {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: unknown, _opts: unknown, callback: unknown) => {
      (callback as (err: Error | null, stdout: string, stderr: string) => void)(
        new Error(message),
        "",
        message,
      );
      return undefined as never;
    },
  );
}

describe("isQmdAvailable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("qmd 可用时返回 true", async () => {
    mockExecFileSuccess("QMD Status...");
    const result = await isQmdAvailable();
    expect(result).toBe(true);
  });

  it("qmd 不可用时返回 false", async () => {
    mockExecFileError("command not found");
    const result = await isQmdAvailable();
    expect(result).toBe(false);
  });
});

describe("initVectorIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应该依次调用 collection remove, collection add, context add, update, embed", async () => {
    const calls: string[][] = [];
    mockExecFile.mockImplementation(
      (_cmd: string, args: unknown, _opts: unknown, callback: unknown) => {
        calls.push(args as string[]);
        (callback as (err: Error | null, stdout: string, stderr: string) => void)(null, "", "");
        return undefined as never;
      },
    );

    await initVectorIndex("/workspace");

    // 验证调用顺序
    expect(calls).toHaveLength(5);

    // 1. 移除旧 collection
    expect(calls[0]).toContain("collection");
    expect(calls[0]).toContain("remove");

    // 2. 添加新 collection
    expect(calls[1]).toContain("collection");
    expect(calls[1]).toContain("add");
    expect(calls[1]).toContain("--mask");
    expect(calls[1]).toContain("**/*.json");

    // 3. 添加 context
    expect(calls[2]).toContain("context");
    expect(calls[2]).toContain("add");

    // 4. update
    expect(calls[3]).toContain("update");

    // 5. embed
    expect(calls[4]).toContain("embed");
  });

  it("collection remove 失败时应该继续执行", async () => {
    let callCount = 0;
    mockExecFile.mockImplementation(
      (_cmd: string, _args: unknown, _opts: unknown, callback: unknown) => {
        callCount++;
        if (callCount === 1) {
          // 第一次调用（remove）失败
          (callback as (err: Error | null, stdout: string, stderr: string) => void)(
            new Error("not found"),
            "",
            "not found",
          );
        } else {
          (callback as (err: Error | null, stdout: string, stderr: string) => void)(null, "", "");
        }
        return undefined as never;
      },
    );

    await expect(initVectorIndex("/workspace")).resolves.not.toThrow();
    expect(callCount).toBe(5);
  });
});

describe("updateVectorIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应该调用 update 和 embed", async () => {
    const calls: string[][] = [];
    mockExecFile.mockImplementation(
      (_cmd: string, args: unknown, _opts: unknown, callback: unknown) => {
        calls.push(args as string[]);
        (callback as (err: Error | null, stdout: string, stderr: string) => void)(null, "", "");
        return undefined as never;
      },
    );

    await updateVectorIndex("/workspace");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("update");
    expect(calls[1]).toContain("embed");
  });
});

describe("vectorSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应该解析 qmd JSON 输出并读取模板文件", async () => {
    const qmdOutput = JSON.stringify([
      {
        docid: "#abc123",
        score: 0.85,
        file: "qmd://prompts/skills/skill:greeting.json",
        title: "用户问候",
        snippet: "...",
      },
    ]);

    const templateJson = JSON.stringify({
      id: "skill:greeting",
      category: "skill",
      name: "用户问候",
      description: "友好问候",
      content: "你好 {{userName}}",
      variables: [{ name: "userName", description: "用户名", required: true }],
      version: "1.0.0",
    });

    // mock execFile 返回 qmd 搜索结果
    mockExecFile.mockImplementation(
      (_cmd: string, _args: unknown, _opts: unknown, callback: unknown) => {
        (callback as (err: Error | null, stdout: string, stderr: string) => void)(
          null,
          qmdOutput,
          "",
        );
        return undefined as never;
      },
    );

    // mock readFile 返回模板 JSON
    mockReadFile.mockResolvedValue(templateJson as never);

    const results = await vectorSearch("/workspace", "用户问候");

    expect(results).toHaveLength(1);
    expect(results[0].template.id).toBe("skill:greeting");
    expect(results[0].score).toBe(0.85);
  });

  it("应该支持不同搜索模式", async () => {
    const calls: string[][] = [];
    mockExecFile.mockImplementation(
      (_cmd: string, args: unknown, _opts: unknown, callback: unknown) => {
        calls.push(args as string[]);
        (callback as (err: Error | null, stdout: string, stderr: string) => void)(null, "[]", "");
        return undefined as never;
      },
    );

    // keyword 模式
    await vectorSearch("/workspace", "test", { mode: "keyword" });
    expect(calls[0]).toContain("search");

    // vector 模式
    await vectorSearch("/workspace", "test", { mode: "vector" });
    expect(calls[1]).toContain("vsearch");

    // query 模式（默认）
    await vectorSearch("/workspace", "test", { mode: "query" });
    expect(calls[2]).toContain("query");
  });

  it("应该传递 limit 和 minScore 参数", async () => {
    const calls: string[][] = [];
    mockExecFile.mockImplementation(
      (_cmd: string, args: unknown, _opts: unknown, callback: unknown) => {
        calls.push(args as string[]);
        (callback as (err: Error | null, stdout: string, stderr: string) => void)(null, "[]", "");
        return undefined as never;
      },
    );

    await vectorSearch("/workspace", "test", { limit: 3, minScore: 0.5 });

    const args = calls[0];
    expect(args).toContain("-n");
    expect(args).toContain("3");
    expect(args).toContain("--min-score");
    expect(args).toContain("0.5");
  });

  it("qmd 输出非 JSON 时返回空数组", async () => {
    mockExecFileSuccess("invalid output");
    const results = await vectorSearch("/workspace", "test");
    expect(results).toEqual([]);
  });
});

describe("removeVectorIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应该调用 context rm 和 collection remove", async () => {
    const calls: string[][] = [];
    mockExecFile.mockImplementation(
      (_cmd: string, args: unknown, _opts: unknown, callback: unknown) => {
        calls.push(args as string[]);
        (callback as (err: Error | null, stdout: string, stderr: string) => void)(null, "", "");
        return undefined as never;
      },
    );

    await removeVectorIndex("/workspace");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("context");
    expect(calls[0]).toContain("rm");
    expect(calls[1]).toContain("collection");
    expect(calls[1]).toContain("remove");
  });

  it("删除失败时不抛出错误", async () => {
    mockExecFileError("not found");
    await expect(removeVectorIndex("/workspace")).resolves.not.toThrow();
  });
});

describe("VectorIndexError", () => {
  it("应该设置正确的 code 和 name", () => {
    const error = new VectorIndexError("测试错误");
    expect(error.code).toBe("VECTOR_INDEX_ERROR");
    expect(error.name).toBe("VectorIndexError");
    expect(error.message).toBe("测试错误");
  });
});
