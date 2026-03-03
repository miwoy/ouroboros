/**
 * channels 配置块 Schema
 *
 * 多通道系统：web（HTTP + WebSocket）、tui（终端）、telegram（Bot）。
 */
import { z } from "zod/v4";

/** Web 通道配置 */
const webChannelSchema = z.object({
  enabled: z.boolean().default(true),
  port: z.number().int().positive().default(8517),
  host: z.string().default("127.0.0.1"),
});

/** TUI 通道配置 */
const tuiChannelSchema = z.object({
  enabled: z.boolean().default(true),
});

/** Telegram 通道配置 */
const telegramChannelSchema = z.object({
  enabled: z.boolean().default(false),
  botToken: z.string().optional(),
  /** 私聊策略 */
  dmPolicy: z.enum(["open", "pairing", "whitelist"]).default("pairing"),
  /** 群聊策略 */
  groupPolicy: z.enum(["open", "allowlist", "deny"]).default("allowlist"),
  /** 流式输出模式 */
  streaming: z.enum(["none", "partial", "full"]).default("partial"),
  /** Telegram 专用代理 */
  proxy: z.string().url().optional(),
});

/**
 * 顶层 channels 配置 Schema
 */
export const channelsBlockSchema = z.object({
  web: webChannelSchema.default({ enabled: true, port: 8517, host: "127.0.0.1" }),
  tui: tuiChannelSchema.default({ enabled: true }),
  telegram: telegramChannelSchema.default({
    enabled: false,
    dmPolicy: "pairing",
    groupPolicy: "allowlist",
    streaming: "partial",
  }),
});

// ─── 类型导出 ──────────────────────────────────────────────

export type WebChannelConfig = z.infer<typeof webChannelSchema>;
export type TuiChannelConfig = z.infer<typeof tuiChannelSchema>;
export type TelegramChannelConfig = z.infer<typeof telegramChannelSchema>;
export type ChannelsConfig = z.infer<typeof channelsBlockSchema>;
