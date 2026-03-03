/**
 * Ouroboros CLI 入口
 *
 * 子命令路由：
 *   ouroboros init          — 首次安装向导
 *   ouroboros start         — 启动 API 服务器（默认）
 *   ouroboros login         — OAuth 登录
 *   ouroboros configure     — 修改已有配置
 *
 * 全局选项：
 *   --config <path>   指定配置文件路径
 *   --verbose         详细输出
 *   --version, -v     版本号
 *   --help, -h        帮助
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HELP = `
Ouroboros CLI — 自指循环 Agent 框架

用法: ouroboros <command> [options]

初始化与配置:
  init              首次安装向导
  configure         修改已有配置
  login [provider]  OAuth 登录指定提供商
  doctor            环境诊断

服务管理:
  start             启动 API 服务器（默认）
  stop              停止正在运行的服务

全局选项:
  --config <path>   指定配置文件路径
  --cwd <path>      工作目录基准（相对路径基于此解析）
  --verbose         详细输出
  --version, -v     版本号
  --help, -h        帮助

示例:
  ouroboros init                     # 首次安装向导
  ouroboros start                    # 启动服务器（workspace 在配置文件目录下）
  ouroboros start --cwd .            # 开发模式（workspace 在当前目录下）
  ouroboros start --config ./my.json # 指定配置启动
  ouroboros stop                     # 停止服务
  ouroboros login openai-codex       # OAuth 登录
  ouroboros doctor                   # 环境诊断
`;

/**
 * 解析全局选项，返回清理后的 args 和选项
 */
function parseGlobalOptions(rawArgs: readonly string[]): {
  args: string[];
  configPath?: string;
  cwd?: string;
  verbose: boolean;
} {
  const args: string[] = [];
  let configPath: string | undefined;
  let cwd: string | undefined;
  let verbose = false;

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--config" && i + 1 < rawArgs.length) {
      configPath = rawArgs[i + 1];
      i++;
    } else if (arg === "--cwd" && i + 1 < rawArgs.length) {
      cwd = rawArgs[i + 1];
      i++;
    } else if (arg === "--verbose") {
      verbose = true;
    } else {
      args.push(arg);
    }
  }

  return { args, configPath, cwd, verbose };
}

/**
 * 读取 package.json 获取版本号
 */
async function getVersion(): Promise<string> {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkgPath = resolve(__dirname, "../../package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as { version: string };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

async function main(): Promise<void> {
  const { args, configPath, cwd, verbose } = parseGlobalOptions(process.argv.slice(2));
  const command = args[0] ?? "start";

  // 将全局选项注入环境变量，供 loadConfig / main 使用
  if (configPath) {
    process.env.__OUROBOROS_CLI_CONFIG = configPath;
  }
  if (cwd) {
    process.env.__OUROBOROS_CLI_CWD = cwd;
  }
  if (verbose) {
    process.env.__OUROBOROS_VERBOSE = "1";
  }

  switch (command) {
    case "init": {
      const { runInit } = await import("./commands/init.js");
      await runInit();
      break;
    }

    case "start": {
      const { runStart } = await import("./commands/start.js");
      await runStart();
      break;
    }

    case "login": {
      const { runLogin } = await import("./commands/login.js");
      await runLogin(args[1]);
      break;
    }

    case "configure": {
      const { runConfigure } = await import("./commands/configure.js");
      await runConfigure();
      break;
    }

    case "doctor": {
      const { runDoctor } = await import("./commands/doctor.js");
      await runDoctor();
      break;
    }

    case "stop": {
      const { runStop } = await import("./commands/stop.js");
      await runStop();
      break;
    }

    case "version":
    case "--version":
    case "-v": {
      const version = await getVersion();
      console.log(`ouroboros v${version}`);
      break;
    }

    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      break;

    default:
      console.error(`❌ 未知命令: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("[ouroboros] CLI 错误:", err);
  process.exit(1);
});
