/**
 * TUI 交互式聊天
 *
 * 使用 readline 实现终端交互：消息输入、SSE 流式输出、命令处理。
 */

import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { TuiClient } from "./client.js";
import * as fmt from "./format.js";

/** 内置命令 */
const COMMANDS: Record<string, string> = {
  "/help": "显示帮助信息",
  "/new": "创建新会话",
  "/sessions": "列出所有会话",
  "/switch <id>": "切换到指定会话",
  "/history": "显示当前会话消息历史",
  "/health": "显示服务器健康状态",
  "/clear": "清屏",
  "/exit": "退出 TUI",
};

/**
 * 启动交互式聊天循环
 */
export async function startChat(client: TuiClient): Promise<void> {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  printBanner();

  // 检查服务器连接
  const health = await tryConnect(client);
  if (!health) {
    console.log(fmt.red("无法连接到 Ouroboros 服务器，请确认后端已启动。"));
    rl.close();
    return;
  }

  console.log(
    fmt.green("已连接"),
    fmt.dim(`v${health.version} | 运行 ${formatUptime(health.uptime)}`),
  );
  console.log(fmt.dim("输入 /help 查看命令列表\n"));

  // 创建初始会话
  let sessionId = await createNewSession(client);
  if (!sessionId) {
    console.log(fmt.red("无法创建会话"));
    rl.close();
    return;
  }

  let running = true;
  while (running) {
    const input = await rl.question(fmt.cyan("你> ")).catch(() => null);
    if (input === null) {
      running = false;
      break;
    }

    const trimmed = input.trim();
    if (!trimmed) continue;

    // 命令处理
    if (trimmed.startsWith("/")) {
      const result = await handleCommand(trimmed, client, sessionId);
      if (result.exit) {
        running = false;
      } else if (result.newSessionId) {
        sessionId = result.newSessionId;
      }
      continue;
    }

    // 发送消息
    await sendAndStream(client, sessionId, trimmed);
  }

  console.log(fmt.dim("\n再见 👋"));
  rl.close();
}

/** 尝试连接服务器 */
async function tryConnect(client: TuiClient): Promise<{ version: string; uptime: number } | null> {
  try {
    return await client.health();
  } catch {
    return null;
  }
}

/** 创建新会话并返回 sessionId */
async function createNewSession(client: TuiClient): Promise<string | null> {
  try {
    const session = await client.createSession("TUI 会话");
    if (session) {
      console.log(fmt.dim(`会话 ${session.sessionId.slice(0, 8)}... 已创建\n`));
      return session.sessionId;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** 命令处理结果 */
interface CommandResult {
  readonly exit: boolean;
  readonly newSessionId?: string;
}

/** 处理斜杠命令 */
async function handleCommand(
  input: string,
  client: TuiClient,
  currentSessionId: string,
): Promise<CommandResult> {
  const [cmd, ...args] = input.split(/\s+/);

  switch (cmd) {
    case "/help":
      printHelp();
      return { exit: false };

    case "/exit":
    case "/quit":
      return { exit: true };

    case "/clear":
      console.clear();
      return { exit: false };

    case "/new": {
      const newId = await createNewSession(client);
      if (newId) return { exit: false, newSessionId: newId };
      console.log(fmt.red("创建会话失败"));
      return { exit: false };
    }

    case "/sessions":
      await printSessions(client, currentSessionId);
      return { exit: false };

    case "/switch": {
      const targetId = args[0];
      if (!targetId) {
        console.log(fmt.yellow("用法: /switch <sessionId>"));
        return { exit: false };
      }
      console.log(fmt.dim(`已切换到会话 ${targetId.slice(0, 8)}...`));
      return { exit: false, newSessionId: targetId };
    }

    case "/history":
      await printHistory(client, currentSessionId);
      return { exit: false };

    case "/health":
      await printHealth(client);
      return { exit: false };

    default:
      console.log(fmt.yellow(`未知命令: ${cmd}，输入 /help 查看帮助`));
      return { exit: false };
  }
}

/** 发送消息并流式显示响应 */
async function sendAndStream(client: TuiClient, sessionId: string, message: string): Promise<void> {
  process.stdout.write(fmt.green("Agent> "));

  let hasOutput = false;

  try {
    await client.sendMessageStream(sessionId, message, {
      onTextDelta(text) {
        process.stdout.write(text);
        hasOutput = true;
      },
      onThinking(text) {
        if (!hasOutput) {
          process.stdout.write(fmt.dim("(思考中...) "));
          hasOutput = true;
        }
        process.stdout.write(fmt.gray(text));
      },
      onToolCall(data) {
        const toolId = (data.toolId as string) || "unknown";
        console.log(fmt.yellow(`\n  🔧 调用工具: ${toolId}`));
      },
      onToolResult(data) {
        const success = data.success as boolean;
        const icon = success ? "✅" : "❌";
        const duration = data.duration ? ` (${data.duration}ms)` : "";
        console.log(fmt.dim(`  ${icon} 工具返回${duration}`));
        process.stdout.write(fmt.green("Agent> "));
      },
      onReactStep(data) {
        const thought = data.thought as string | undefined;
        if (thought) {
          console.log(fmt.magenta(`\n  💭 ${thought}`));
          process.stdout.write(fmt.green("Agent> "));
        }
      },
      onDone() {
        if (hasOutput) console.log();
        console.log();
      },
      onError(msg) {
        console.log(fmt.red(`\n错误: ${msg}`));
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.log(fmt.red(`\n请求失败: ${errMsg}`));
  }
}

/** 打印启动横幅 */
function printBanner(): void {
  console.log(fmt.separator());
  console.log(fmt.bold(fmt.cyan("  Ouroboros TUI")));
  console.log(fmt.dim("  自指循环 Agent 终端界面"));
  console.log(fmt.separator());
  console.log();
}

/** 打印帮助 */
function printHelp(): void {
  console.log(fmt.bold("\n可用命令:"));
  for (const [cmd, desc] of Object.entries(COMMANDS)) {
    console.log(`  ${fmt.cyan(cmd.padEnd(20))} ${desc}`);
  }
  console.log();
}

/** 打印会话列表 */
async function printSessions(client: TuiClient, currentId: string): Promise<void> {
  try {
    const sessions = await client.listSessions();
    if (sessions.length === 0) {
      console.log(fmt.dim("暂无会话"));
      return;
    }
    console.log(fmt.bold("\n会话列表:"));
    for (const s of sessions) {
      const marker = s.sessionId === currentId ? fmt.green("● ") : "  ";
      const id = s.sessionId.slice(0, 8);
      const desc = s.description || "无描述";
      const msgs = `${s.messageCount} 条消息`;
      console.log(`${marker}${fmt.cyan(id)} ${desc} ${fmt.dim(`(${msgs})`)}`);
    }
    console.log();
  } catch {
    console.log(fmt.red("获取会话列表失败"));
  }
}

/** 打印消息历史 */
async function printHistory(client: TuiClient, sessionId: string): Promise<void> {
  try {
    const messages = await client.getMessages(sessionId);
    if (messages.length === 0) {
      console.log(fmt.dim("暂无消息"));
      return;
    }
    console.log(fmt.bold("\n消息历史:"));
    for (const m of messages) {
      const time = fmt.formatTime(m.timestamp);
      const label =
        m.role === "user"
          ? fmt.cyan("你")
          : m.role === "agent"
            ? fmt.green("Agent")
            : fmt.yellow("系统");
      const content = m.content.length > 200 ? `${m.content.slice(0, 200)}...` : m.content;
      console.log(`  ${fmt.dim(time)} ${label}: ${content}`);
    }
    console.log();
  } catch {
    console.log(fmt.red("获取消息历史失败"));
  }
}

/** 打印服务器健康信息 */
async function printHealth(client: TuiClient): Promise<void> {
  try {
    const h = await client.health();
    if (!h) {
      console.log(fmt.red("无法获取健康信息"));
      return;
    }
    console.log(fmt.bold("\n服务器状态:"));
    console.log(`  状态:   ${h.status === "ok" ? fmt.green("正常") : fmt.red(h.status)}`);
    console.log(`  版本:   ${h.version}`);
    console.log(`  运行时间: ${formatUptime(h.uptime)}`);
    console.log();
  } catch {
    console.log(fmt.red("连接失败"));
  }
}

/** 格式化运行时间 */
function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
