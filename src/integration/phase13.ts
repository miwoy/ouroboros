/**
 * 阶段十三集成测试 — 配置重构 + 用户目录 + CLI 增强
 *
 * 验证：
 *  [1] Config Resolver — 配置文件查找链（CLI→env→local→user）
 *  [2] Config Schema v2 — 新层级结构解析
 *  [3] v1→v2 Migration — 自动迁移
 *  [4] Config Loader — 端到端加载（文件→JSONC→env替换→v1迁移→Zod校验）
 *  [5] CLI: doctor — 环境诊断
 *  [6] CLI: stop — PID 文件管理
 *  [7] handlers.ts split — 模块拆分后的 API 正确性
 */

import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Config
import {
  configSchema,
  parseModelRef,
  getModelIds,
  extractAvailableModels,
} from "../config/schema/index.js";
import { loadConfig } from "../config/loader.js";
import { resolveConfigPath, expandTilde, resolveDataDir } from "../config/resolver.js";
import { isV1Config, migrateV1ToV2 } from "../config/migration.js";

// API
import { createApiServer } from "../api/server.js";
import { createLogger } from "../logger/logger.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

let passed = 0;
let failed = 0;
const failedItems: string[] = [];

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed++;
    console.log(`    ✅ ${label}`);
  } else {
    failed++;
    failedItems.push(label);
    console.error(`    ❌ ${label}`);
  }
}

function section(title: string): void {
  console.log(`\n${"─".repeat(56)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(56)}`);
}

/** 简易 JSON 响应解析 */
async function json(res: Response): Promise<any> {
  return res.json();
}

async function main(): Promise<void> {
  console.log("🐍 阶段十三集成测试 — 配置重构 + 用户目录 + CLI 增强\n");

  const workDir = await mkdtemp(join(tmpdir(), "phase13-"));

  try {
    // ════════════════════════════════════════════════════════════
    // [1] Config Resolver — 配置文件查找链
    // ════════════════════════════════════════════════════════════
    section("[1/7] Config Resolver — 路径解析");

    // CLI 参数优先
    const cliResolved = await resolveConfigPath("/tmp/nonexistent.json");
    assert(cliResolved.source === "cli", "CLI 参数 → source=cli");
    assert(cliResolved.path === "/tmp/nonexistent.json", "CLI 参数 → 绝对路径");

    // 环境变量
    const oldEnv = process.env.OUROBOROS_CONFIG;
    process.env.OUROBOROS_CONFIG = "/tmp/env-config.json";
    const envResolved = await resolveConfigPath();
    assert(envResolved.source === "env", "环境变量 → source=env");
    assert(envResolved.path === "/tmp/env-config.json", "环境变量 → 正确路径");
    if (oldEnv !== undefined) {
      process.env.OUROBOROS_CONFIG = oldEnv;
    } else {
      delete process.env.OUROBOROS_CONFIG;
    }

    // expandTilde
    const expanded = expandTilde("~/test");
    assert(!expanded.startsWith("~"), "expandTilde 展开 ~ 前缀");
    assert(expanded.endsWith("/test"), "expandTilde 保留路径后缀");

    // resolveDataDir
    const defaultDir = resolveDataDir();
    assert(defaultDir.includes(".ouroboros"), "resolveDataDir 默认 → ~/.ouroboros");
    const customDir = resolveDataDir("~/custom-data");
    assert(customDir.includes("custom-data"), "resolveDataDir 自定义路径");

    // ════════════════════════════════════════════════════════════
    // [2] Config Schema v2 — 新层级结构
    // ════════════════════════════════════════════════════════════
    section("[2/7] Config Schema v2 — 层级结构");

    // 最小配置（defaults 填充）
    const minConfig = configSchema.parse({
      system: {},
      provider: {
        ollama: { type: "openai-compatible", baseUrl: "http://localhost:11434/v1" },
      },
      agents: { default: { model: "ollama/llama3", workspacePath: workDir } },
    });
    assert(minConfig.system.logLevel === "info", "system.logLevel 默认 info");
    assert(minConfig.system.model.timeout === 30000, "system.model.timeout 默认 30000");
    assert(minConfig.system.react.maxIterations === 20, "system.react.maxIterations 默认 20");
    assert(minConfig.system.memory.shortTerm === true, "system.memory.shortTerm 默认 true");
    assert(minConfig.system.self.focusLevel === 60, "system.self.focusLevel 默认 60");
    assert(minConfig.system.inspector.enabled === true, "system.inspector.enabled 默认 true");
    assert(minConfig.system.reflection.enabled === true, "system.reflection.enabled 默认 true");
    assert(minConfig.tools.web.search.provider === "bing", "tools.web.search.provider 默认 bing");
    assert(minConfig.channels.web.enabled === true, "channels.web.enabled 默认 true");
    assert(minConfig.persistence.enabled === true, "persistence.enabled 默认 true");

    // 完整配置（含 OAuth provider）
    const fullConfig = configSchema.parse({
      system: {
        logLevel: "debug",
        proxy: "http://proxy:8080",
      },
      provider: {
        "openai-hk": {
          api: "openai-completions",
          baseUrl: "https://api.openai-hk.com/v1",
          apiKey: "sk-test",
          models: [{ id: "gpt-4o", name: "GPT-4o", reasoning: false, input: ["text", "image"] }],
        },
        anthropic: {
          type: "anthropic",
          // apiKey 可选（OAuth 类型）
        },
      },
      agents: {
        default: {
          model: "openai-hk/gpt-4o",
          workspacePath: workDir,
          thinkLevel: "high",
        },
      },
    });
    assert(fullConfig.system.logLevel === "debug", "system.logLevel = debug");
    assert(fullConfig.system.proxy === "http://proxy:8080", "system.proxy 生效");
    assert(fullConfig.provider["openai-hk"].api === "openai-completions", "provider.api 字段");
    assert(fullConfig.agents.default.thinkLevel === "high", "agent.thinkLevel = high");

    // thinkLevel=off（替代旧 think=false）
    const offConfig = configSchema.parse({
      provider: { t: { type: "openai", apiKey: "k" } },
      agents: { default: { model: "t/m", workspacePath: workDir, thinkLevel: "off" } },
    });
    assert(offConfig.agents.default.thinkLevel === "off", "thinkLevel=off 合法");

    // parseModelRef
    const ref = parseModelRef("openai-hk/gpt-4o");
    assert(ref !== null, "parseModelRef 解析成功");
    assert(ref?.provider === "openai-hk", "parseModelRef provider 正确");
    assert(ref?.model === "gpt-4o", "parseModelRef model 正确");
    assert(parseModelRef("invalid") === null, "parseModelRef 无效格式返回 null");

    // getModelIds — 字符串数组
    const strModelIds = getModelIds({ type: "openai", models: ["gpt-4o", "gpt-4o-mini"] } as any);
    assert(strModelIds.length === 2, "getModelIds 字符串数组: 2 个模型");

    // getModelIds — 结构化数组
    const structModelIds = getModelIds({
      api: "openai-completions",
      models: [{ id: "gpt-4o", name: "GPT-4o" }],
    } as any);
    assert(
      structModelIds.length === 1 && structModelIds[0] === "gpt-4o",
      "getModelIds 结构化: gpt-4o",
    );

    // extractAvailableModels
    const allModels = extractAvailableModels(fullConfig.provider);
    assert(allModels.includes("openai-hk/gpt-4o"), "extractAvailableModels 包含 openai-hk/gpt-4o");

    // ════════════════════════════════════════════════════════════
    // [3] v1→v2 Migration — 自动迁移
    // ════════════════════════════════════════════════════════════
    section("[3/7] v1→v2 Migration — 格式迁移");

    const v1Config = {
      system: { logLevel: "debug" },
      providers: {
        myopenai: { type: "openai", apiKey: "sk-old" },
      },
      model: { timeout: 60000 },
      react: { maxIterations: 50 },
      memory: { shortTerm: false },
      api: { port: 8080, host: "0.0.0.0" },
      agents: {
        default: {
          model: "myopenai/gpt-4o",
          workspacePath: workDir,
          think: false,
          thinkLevel: "high",
        },
      },
      webSearch: { provider: "brave", apiKey: "brave-key" },
    };

    // 检测为 v1
    assert(isV1Config(v1Config as any), "isV1Config 检测到 v1 格式");

    // v2 不应被检测为 v1
    const v2Sample = {
      system: {},
      provider: { test: { type: "openai" } },
      agents: { default: { model: "test/m", workspacePath: workDir } },
    };
    assert(!isV1Config(v2Sample), "isV1Config 不误判 v2 格式");

    // 迁移
    const migrated = migrateV1ToV2(v1Config as any);
    assert("provider" in migrated && !("providers" in migrated), "迁移: providers → provider");
    assert(
      (migrated.system as any)?.model?.timeout === 60000,
      "迁移: model.timeout → system.model.timeout",
    );
    assert((migrated.system as any)?.react?.maxIterations === 50, "迁移: react → system.react");
    assert((migrated.system as any)?.api?.port === 8080, "迁移: api → system.api");

    // think=false → thinkLevel=off
    const migratedAgent = (migrated.agents as any)?.default;
    assert(migratedAgent?.thinkLevel === "off", "迁移: think=false → thinkLevel=off");
    assert(!("think" in (migratedAgent ?? {})), "迁移: think 字段已删除");

    // type → api 协议映射
    const migratedProvider = (migrated.provider as any)?.myopenai;
    assert(
      migratedProvider?.api === "openai-completions",
      "迁移: type=openai → api=openai-completions",
    );

    // webSearch → tools.web.search
    const migratedTools = migrated.tools as any;
    assert(migratedTools?.web?.search?.provider === "brave", "迁移: webSearch → tools.web.search");

    // 迁移后应能通过 Zod 校验
    const migratedParsed = configSchema.safeParse(migrated);
    assert(migratedParsed.success === true, "迁移后配置通过 Zod 校验");

    // ════════════════════════════════════════════════════════════
    // [4] Config Loader — 端到端加载
    // ════════════════════════════════════════════════════════════
    section("[4/7] Config Loader — 端到端");

    // 写入 v2 配置文件
    const configDir = join(workDir, "config-test");
    await mkdir(configDir, { recursive: true });
    const v2ConfigPath = join(configDir, "config.json");
    const v2Content = JSON.stringify({
      system: { logLevel: "debug" },
      provider: {
        testprov: { type: "openai", apiKey: "test-key-123" },
      },
      agents: { default: { model: "testprov/gpt-4o", workspacePath: workDir } },
    });
    await writeFile(v2ConfigPath, v2Content, "utf-8");

    const loaded = await loadConfig(v2ConfigPath);
    assert(loaded.system.logLevel === "debug", "Loader: logLevel = debug");
    assert(loaded.provider.testprov.apiKey === "test-key-123", "Loader: apiKey 正确");
    assert(loaded.agents.default.model === "testprov/gpt-4o", "Loader: model 引用正确");

    // JSONC 支持（带注释）
    const jsoncPath = join(configDir, "jsonc-config.json");
    const jsoncContent = `{
  // 这是注释
  "system": { "logLevel": "warn" },
  /* 块注释 */
  "provider": {
    "test": { "type": "openai", "apiKey": "k" }
  },
  "agents": { "default": { "model": "test/m", "workspacePath": "${workDir.replace(/\\/g, "/")}" } }
}`;
    await writeFile(jsoncPath, jsoncContent, "utf-8");
    const jsoncLoaded = await loadConfig(jsoncPath);
    assert(jsoncLoaded.system.logLevel === "warn", "Loader: JSONC 注释正确处理");

    // v1 文件自动迁移
    const v1FilePath = join(configDir, "v1-config.json");
    const v1Content = JSON.stringify({
      providers: {
        old: { type: "openai", apiKey: "old-key" },
      },
      model: { timeout: 45000 },
      agents: { default: { model: "old/gpt-4o", workspacePath: workDir } },
    });
    await writeFile(v1FilePath, v1Content, "utf-8");
    const v1Loaded = await loadConfig(v1FilePath);
    assert(v1Loaded.provider.old.apiKey === "old-key", "Loader: v1 自动迁移 — apiKey 保留");
    assert(
      v1Loaded.system.model.timeout === 45000,
      "Loader: v1 自动迁移 — model.timeout 迁移到 system",
    );

    // 环境变量替换
    process.env.__TEST_API_KEY = "env-replaced-key";
    const envConfigPath = join(configDir, "env-config.json");
    await writeFile(
      envConfigPath,
      JSON.stringify({
        provider: { ep: { type: "openai", apiKey: "${__TEST_API_KEY}" } },
        agents: { default: { model: "ep/m", workspacePath: workDir } },
      }),
      "utf-8",
    );
    const envLoaded = await loadConfig(envConfigPath);
    assert(envLoaded.provider.ep.apiKey === "env-replaced-key", "Loader: 环境变量替换");
    delete process.env.__TEST_API_KEY;

    // ════════════════════════════════════════════════════════════
    // [5] CLI: doctor — 环境诊断（模块导入验证）
    // ════════════════════════════════════════════════════════════
    section("[5/7] CLI: doctor — 模块完整性");

    // 验证 doctor 模块可以正确导入
    const doctorMod = await import("../cli/commands/doctor.js");
    assert(typeof doctorMod.runDoctor === "function", "doctor: runDoctor 导出正确");

    // ════════════════════════════════════════════════════════════
    // [6] CLI: stop — PID 文件管理
    // ════════════════════════════════════════════════════════════
    section("[6/7] CLI: stop — 模块完整性");

    const stopMod = await import("../cli/commands/stop.js");
    assert(typeof stopMod.runStop === "function", "stop: runStop 导出正确");
    assert(typeof stopMod.getPidPath === "function", "stop: getPidPath 导出正确");

    const pidPath = stopMod.getPidPath();
    assert(pidPath.includes("ouroboros.pid"), "stop: PID 路径包含 ouroboros.pid");
    assert(pidPath.includes(".ouroboros"), "stop: PID 路径在 ~/.ouroboros/ 下");

    // ════════════════════════════════════════════════════════════
    // [7] handlers.ts split — API 模块拆分后正确性
    // ════════════════════════════════════════════════════════════
    section("[7/7] API — handlers.ts 拆分验证");

    // 验证新模块可以正确导入
    const handlerProcess = await import("../api/handler-process.js");
    assert(
      typeof handlerProcess.processMessage === "function",
      "handler-process: processMessage 导出",
    );
    assert(
      typeof handlerProcess.createStreamEvents === "function",
      "handler-process: createStreamEvents 导出",
    );
    assert(
      typeof handlerProcess.createTreeStreamEvents === "function",
      "handler-process: createTreeStreamEvents 导出",
    );
    assert(
      typeof handlerProcess.applyModelOverrides === "function",
      "handler-process: applyModelOverrides 导出",
    );

    const handlerContext = await import("../api/handler-context.js");
    assert(
      handlerContext.DEFAULT_AGENT_ID === "agent:main",
      "handler-context: DEFAULT_AGENT_ID = agent:main",
    );
    assert(
      typeof handlerContext.buildModelMessages === "function",
      "handler-context: buildModelMessages 导出",
    );
    assert(
      typeof handlerContext.buildContextPrompt === "function",
      "handler-context: buildContextPrompt 导出",
    );
    assert(
      typeof handlerContext.writebackMemory === "function",
      "handler-context: writebackMemory 导出",
    );
    assert(
      typeof handlerContext.triggerReflection === "function",
      "handler-context: triggerReflection 导出",
    );

    // 端到端 API 验证（拆分后路由仍正常工作）
    const apiWorkDir = await mkdtemp(join(tmpdir(), "phase13-api-"));
    const apiLogger = createLogger(apiWorkDir, "info");

    const server = createApiServer({
      logger: apiLogger,
      workspacePath: apiWorkDir,
      config: {
        port: 0,
        host: "127.0.0.1",
        rateLimit: { windowMs: 60000, maxRequests: 10000 },
        corsOrigin: "*",
      },
    });
    await server.start();
    const addr = server.getHttpServer().address();
    if (!addr || typeof addr === "string") throw new Error("无效地址");
    const baseUrl = `http://127.0.0.1:${(addr as any).port}`;

    try {
      // 健康检查
      const healthRes = await fetch(`${baseUrl}/api/health`);
      assert(healthRes.status === 200, "API: 拆分后 /api/health → 200");

      // 消息发送（placeholder 模式）
      const msgRes = await fetch(`${baseUrl}/api/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "拆分测试" }),
      });
      const msgBody = await json(msgRes);
      assert(msgRes.status === 200, "API: 拆分后 /api/chat/message → 200");
      assert(typeof msgBody.data.response === "string", "API: 拆分后响应正确");

      // SSE 流式
      const sseRes = await fetch(`${baseUrl}/api/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "流式拆分测试", stream: true }),
      });
      assert(
        sseRes.headers.get("content-type") === "text/event-stream",
        "API: 拆分后 SSE Content-Type 正确",
      );
      const sseText = await sseRes.text();
      assert(sseText.includes("event: done"), "API: 拆分后 SSE 包含 done 事件");

      // Agent 列表（验证 DEFAULT_AGENT_ID 正确导入）
      const agentsRes = await fetch(`${baseUrl}/api/agents`);
      const agentsBody = await json(agentsRes);
      assert(agentsBody.data[0].id === "agent:main", "API: 拆分后 DEFAULT_AGENT_ID 正确");
    } finally {
      await server.stop();
      await rm(apiWorkDir, { recursive: true, force: true });
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════
  // 汇总
  // ════════════════════════════════════════════════════════════
  console.log(`\n${"═".repeat(56)}`);
  console.log(`  阶段十三集成测试结果: ${passed} 通过, ${failed} 失败 / 共 ${passed + failed} 项`);
  console.log(`${"═".repeat(56)}`);

  if (failed > 0) {
    console.log("\n  失败项:");
    for (const item of failedItems) {
      console.log(`    ❌ ${item}`);
    }
    console.log();
    process.exit(1);
  }

  console.log("\n  🎉 配置重构集成测试全部通过！\n");
}

main().catch((err) => {
  console.error("\n💥 集成测试异常:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
