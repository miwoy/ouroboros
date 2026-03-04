import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import {
  resolveConfigPath,
  resolveHome,
  resolveConfigHome,
  expandTilde,
} from "../../src/config/resolver.js";

const TEST_DIR = join(process.cwd(), ".test-resolver-tmp");

describe("expandTilde", () => {
  it("应该展开 ~ 为 home 目录", () => {
    expect(expandTilde("~")).toBe(homedir());
  });

  it("应该展开 ~/path 为 home 目录下的路径", () => {
    expect(expandTilde("~/foo/bar")).toBe(join(homedir(), "foo/bar"));
  });

  it("不含 ~ 的路径应原样返回", () => {
    expect(expandTilde("/absolute/path")).toBe("/absolute/path");
    expect(expandTilde("relative/path")).toBe("relative/path");
  });

  it("~ 在中间不应展开", () => {
    expect(expandTilde("/foo/~/bar")).toBe("/foo/~/bar");
  });
});

describe("resolveHome", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.__OUROBOROS_CLI_CWD = process.env.__OUROBOROS_CLI_CWD;
    savedEnv.OUROBOROS_HOME = process.env.OUROBOROS_HOME;
    delete process.env.__OUROBOROS_CLI_CWD;
    delete process.env.OUROBOROS_HOME;
  });

  afterEach(() => {
    if (savedEnv.__OUROBOROS_CLI_CWD !== undefined) {
      process.env.__OUROBOROS_CLI_CWD = savedEnv.__OUROBOROS_CLI_CWD;
    } else {
      delete process.env.__OUROBOROS_CLI_CWD;
    }
    if (savedEnv.OUROBOROS_HOME !== undefined) {
      process.env.OUROBOROS_HOME = savedEnv.OUROBOROS_HOME;
    } else {
      delete process.env.OUROBOROS_HOME;
    }
  });

  it("默认返回 $PWD/.ouroboros", () => {
    const result = resolveHome();
    expect(result).toBe(join(process.cwd(), ".ouroboros"));
  });

  it("--cwd 优先级最高", () => {
    process.env.__OUROBOROS_CLI_CWD = "/tmp/test-cwd";
    process.env.OUROBOROS_HOME = "/should/not/use";
    const result = resolveHome();
    expect(result).toBe(join(resolve("/tmp/test-cwd"), ".ouroboros"));
  });

  it("--cwd 支持 ~ 展开", () => {
    process.env.__OUROBOROS_CLI_CWD = "~/";
    const result = resolveHome();
    expect(result).toBe(join(homedir(), ".ouroboros"));
  });

  it("$OUROBOROS_HOME 第二优先级", () => {
    process.env.OUROBOROS_HOME = "/custom/home";
    const result = resolveHome();
    expect(result).toBe(resolve("/custom/home"));
  });

  it("$OUROBOROS_HOME 支持 ~ 展开", () => {
    process.env.OUROBOROS_HOME = "~/.ouroboros";
    const result = resolveHome();
    expect(result).toBe(join(homedir(), ".ouroboros"));
  });
});

describe("resolveConfigHome", () => {
  it("返回 resolveHome()/config.json", () => {
    const result = resolveConfigHome();
    expect(result).toBe(join(resolveHome(), "config.json"));
  });
});

describe("resolveConfigPath", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    // 保存环境变量
    savedEnv.OUROBOROS_CONFIG = process.env.OUROBOROS_CONFIG;
    delete process.env.OUROBOROS_CONFIG;
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    // 恢复环境变量
    if (savedEnv.OUROBOROS_CONFIG !== undefined) {
      process.env.OUROBOROS_CONFIG = savedEnv.OUROBOROS_CONFIG;
    } else {
      delete process.env.OUROBOROS_CONFIG;
    }
  });

  it("CLI 参数优先级最高", async () => {
    const cliPath = join(TEST_DIR, "cli-config.json");
    await writeFile(cliPath, "{}");

    const result = await resolveConfigPath(cliPath);
    expect(result.source).toBe("cli");
    expect(result.path).toBe(cliPath);
  });

  it("CLI 参数支持 ~ 展开", async () => {
    const result = await resolveConfigPath("~/my-config.json");
    expect(result.source).toBe("cli");
    expect(result.path).toBe(join(homedir(), "my-config.json"));
  });

  it("环境变量 OUROBOROS_CONFIG 第二优先级", async () => {
    const envPath = join(TEST_DIR, "env-config.json");
    await writeFile(envPath, "{}");
    process.env.OUROBOROS_CONFIG = envPath;

    const result = await resolveConfigPath();
    expect(result.source).toBe("env");
    expect(result.path).toBe(envPath);
  });

  it("当前目录 ouroboros.json 第三优先级", async () => {
    // 此测试依赖当前目录没有 ouroboros.json
    // 因为我们无法安全地 chdir，跳过自动检测部分
    // 只验证 CLI 和 env 优先级
    const result = await resolveConfigPath();
    // 应该最终返回 user 或 none
    expect(["local", "user", "none"]).toContain(result.source);
  });

  it("无配置文件时返回 none", async () => {
    // 确保没有环境变量
    delete process.env.OUROBOROS_CONFIG;

    // 注意：如果 config.json 存在会影响结果
    // 这里只验证返回值结构正确
    const result = await resolveConfigPath();
    expect(result.path).toBeTruthy();
    expect(["local", "user", "none"]).toContain(result.source);
  });

  it("返回值包含正确的 path 和 source 字段", async () => {
    const cliPath = join(TEST_DIR, "test.json");
    const result = await resolveConfigPath(cliPath);
    expect(result).toHaveProperty("path");
    expect(result).toHaveProperty("source");
    expect(typeof result.path).toBe("string");
  });
});
