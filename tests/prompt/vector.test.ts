import { describe, it, expect, vi, beforeEach } from "vitest";
import { execFile } from "node:child_process";
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

const mockExecFile = vi.mocked(execFile);

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
    const result = await isQmdAvailable("/workspace");
    expect(result).toBe(true);
  });

  it("qmd 不可用时返回 false", async () => {
    mockExecFileError("command not found");
    const result = await isQmdAvailable("/workspace");
    expect(result).toBe(false);
  });

  it("应该使用 npx qmd 调用", async () => {
    mockExecFileSuccess();
    await isQmdAvailable("/workspace");

    expect(mockExecFile).toHaveBeenCalledWith(
      "npx",
      expect.arrayContaining(["qmd", "--index", "ouroboros", "status"]),
      expect.objectContaining({
        env: expect.objectContaining({
          XDG_CACHE_HOME: expect.stringContaining("vectors"),
        }),
      }),
      expect.any(Function),
    );
  });
});

describe("initVectorIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应该检查 collection 是否存在，不存在则创建", async () => {
    const calls: { cmd: string; args: string[] }[] = [];
    mockExecFile.mockImplementation(
      (cmd: string, args: unknown, _opts: unknown, callback: unknown) => {
        calls.push({ cmd: cmd as string, args: args as string[] });
        const argsArr = args as string[];

        // collection list 返回空数组
        if (argsArr.includes("collection") && argsArr.includes("list")) {
          (callback as (err: Error | null, stdout: string, stderr: string) => void)(null, "[]", "");
        } else {
          (callback as (err: Error | null, stdout: string, stderr: string) => void)(null, "", "");
        }
        return undefined as never;
      },
    );

    await initVectorIndex("/workspace");

    // 验证调用了 collection list, collection add, context add, update, embed
    const argStrings = calls.map((c) => c.args.join(" "));
    expect(argStrings.some((s) => s.includes("collection") && s.includes("list"))).toBe(true);
    expect(argStrings.some((s) => s.includes("collection") && s.includes("add"))).toBe(true);
    expect(argStrings.some((s) => s.includes("update"))).toBe(true);
    expect(argStrings.some((s) => s.includes("embed"))).toBe(true);
  });

  it("collection 已存在时不重新创建", async () => {
    const calls: string[][] = [];
    mockExecFile.mockImplementation(
      (_cmd: string, args: unknown, _opts: unknown, callback: unknown) => {
        calls.push(args as string[]);
        const argsArr = args as string[];

        // collection list 返回已有的 collection
        if (argsArr.includes("collection") && argsArr.includes("list")) {
          (callback as (err: Error | null, stdout: string, stderr: string) => void)(
            null,
            JSON.stringify([{ name: "prompts" }, { name: "memory" }]),
            "",
          );
        } else {
          (callback as (err: Error | null, stdout: string, stderr: string) => void)(null, "", "");
        }
        return undefined as never;
      },
    );

    await initVectorIndex("/workspace");

    // 不应有 collection add 调用
    const hasCollectionAdd = calls.some((a) => a.includes("collection") && a.includes("add"));
    expect(hasCollectionAdd).toBe(false);
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

  it("应该解析 qmd JSON 输出", async () => {
    const qmdOutput = JSON.stringify([
      {
        docid: "#abc123",
        score: 0.85,
        file: "qmd://prompts/skill.md",
        title: "技能注册表",
        snippet: "用户问候 | skill:greeting | 友好问候",
      },
    ]);

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

    const results = await vectorSearch("/workspace", "用户问候");

    expect(results).toHaveLength(1);
    expect(results[0].fileType).toBe("skill");
    expect(results[0].score).toBe(0.85);
    expect(results[0].content).toContain("用户问候");
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

  it("应该设置 XDG_CACHE_HOME 环境变量", async () => {
    mockExecFileSuccess("[]");
    await vectorSearch("/workspace", "test");

    expect(mockExecFile).toHaveBeenCalledWith(
      "npx",
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({
          XDG_CACHE_HOME: expect.stringContaining("vectors"),
        }),
      }),
      expect.any(Function),
    );
  });
});

describe("removeVectorIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应该移除所有 collection 及其上下文", async () => {
    const calls: string[][] = [];
    mockExecFile.mockImplementation(
      (_cmd: string, args: unknown, _opts: unknown, callback: unknown) => {
        calls.push(args as string[]);
        (callback as (err: Error | null, stdout: string, stderr: string) => void)(null, "", "");
        return undefined as never;
      },
    );

    await removeVectorIndex("/workspace");

    // 应调用 context rm 和 collection remove（每个 collection 各一次）
    const contextRmCalls = calls.filter((a) => a.includes("context") && a.includes("rm"));
    const collectionRemoveCalls = calls.filter(
      (a) => a.includes("collection") && a.includes("remove"),
    );
    expect(contextRmCalls.length).toBeGreaterThanOrEqual(2);
    expect(collectionRemoveCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("删除失败时不抛出错误", async () => {
    mockExecFileError("not found");
    await expect(removeVectorIndex("/workspace")).resolves.not.toThrow();
  });
});

describe("vectorSearch - collection 参数", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应该传递 collection 参数", async () => {
    const calls: string[][] = [];
    mockExecFile.mockImplementation(
      (_cmd: string, args: unknown, _opts: unknown, callback: unknown) => {
        calls.push(args as string[]);
        (callback as (err: Error | null, stdout: string, stderr: string) => void)(null, "[]", "");
        return undefined as never;
      },
    );

    await vectorSearch("/workspace", "test", { collection: "prompts" });
    expect(calls[0]).toContain("-c");
    expect(calls[0]).toContain("prompts");
  });
});

describe("initVectorIndex - context add 失败", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("context add 失败时应该继续执行", async () => {
    let callCount = 0;
    mockExecFile.mockImplementation(
      (_cmd: string, args: unknown, _opts: unknown, callback: unknown) => {
        callCount++;
        const argsArr = args as string[];

        if (argsArr.includes("collection") && argsArr.includes("list")) {
          (callback as (err: Error | null, stdout: string, stderr: string) => void)(null, "[]", "");
        } else if (argsArr.includes("context") && argsArr.includes("add")) {
          (callback as (err: Error | null, stdout: string, stderr: string) => void)(
            new Error("context already exists"),
            "",
            "context already exists",
          );
        } else {
          (callback as (err: Error | null, stdout: string, stderr: string) => void)(null, "", "");
        }
        return undefined as never;
      },
    );

    await expect(initVectorIndex("/workspace")).resolves.not.toThrow();
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
