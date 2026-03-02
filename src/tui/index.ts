/**
 * TUI 入口
 *
 * 解析命令行参数，创建 API 客户端，启动交互式聊天。
 *
 * 用法: npx tsx src/tui/index.ts [--host HOST] [--port PORT] [--key API_KEY]
 */

import { createTuiClient } from "./client.js";
import { startChat } from "./chat.js";

/** 解析命令行参数 */
function parseArgs(argv: readonly string[]): {
  host: string;
  port: number;
  apiKey?: string;
} {
  let host = "127.0.0.1";
  let port = 3000;
  let apiKey: string | undefined;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--host" || arg === "-h") && next) {
      host = next;
      i++;
    } else if ((arg === "--port" || arg === "-p") && next) {
      port = parseInt(next, 10);
      i++;
    } else if ((arg === "--key" || arg === "-k") && next) {
      apiKey = next;
      i++;
    } else if (arg === "--help") {
      printUsage();
      process.exit(0);
    }
  }

  return { host, port, apiKey };
}

/** 打印用法 */
function printUsage(): void {
  console.log(`
Ouroboros TUI — 终端交互界面

用法:
  npx tsx src/tui/index.ts [选项]

选项:
  --host, -h <HOST>   服务器地址 (默认: 127.0.0.1)
  --port, -p <PORT>   服务器端口 (默认: 3000)
  --key,  -k <KEY>    API 密钥
  --help              显示帮助
`);
}

async function main(): Promise<void> {
  const { host, port, apiKey } = parseArgs(process.argv);
  const baseUrl = `http://${host}:${port}`;

  const client = createTuiClient({ baseUrl, apiKey });
  await startChat(client);
}

main().catch((err) => {
  console.error("TUI 启动失败:", err);
  process.exit(1);
});
