/**
 * Ouroboros CLI 入口
 *
 * 子命令路由：
 *   ouroboros start      — 启动 API 服务器
 *   ouroboros login      — OAuth 登录
 *   ouroboros configure  — 交互式配置向导
 */

const HELP = `
🐍 Ouroboros CLI

用法: ouroboros <command> [options]

命令:
  start             启动 API 服务器（默认）
  login [provider]  OAuth 登录指定提供商
  configure         交互式配置向导

示例:
  npm run dev                    # 启动服务器
  npm run login -- openai-codex  # 登录 OpenAI Codex
  npm run configure              # 配置向导
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? "start";

  switch (command) {
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
