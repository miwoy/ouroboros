# Ouroboros 配置说明（CONFIGURE）

Ouroboros 使用 JSON 配置文件，支持 JSONC 格式（允许注释）。

## 配置文件查找顺序

1. `--config <path>` — CLI 参数指定
2. `$OUROBOROS_CONFIG` — 环境变量指定
3. `./ouroboros.json` — 当前目录（项目级覆盖）
4. `./config.json` — 当前目录（兼容旧版）
5. `~/.ouroboros/config.json` — 用户级默认

首次使用时，运行 `ouroboros init` 向导或复制 `config.example.json` 并按需修改。

支持 `${ENV_VAR}` 格式引用环境变量（环境变量未设置时保留原值）。

---

## 配置结构概览

```jsonc
{
  "system": { ... },       // 系统配置（日志、代理、API、模型调用、工具执行等）
  "provider": { ... },     // 模型提供商（单数）
  "agents": { ... },       // Agent 配置
  "tools": { ... },        // 外部工具服务（搜索、抓取）
  "channels": { ... },     // 多通道（web/tui/telegram）
  "persistence": { ... }   // 状态持久化
}
```

---

## system — 系统配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `logLevel` | `"debug" \| "info" \| "warn" \| "error"` | 否 | `"info"` | 日志输出级别 |
| `cwd` | `string` | 否 | `"~/.ouroboros"` | 用户数据根目录 |
| `proxy` | `string` (URL) | 否 | — | HTTP 代理地址，配置后系统所有对外请求使用此代理。空字符串视为未配置 |

### system.api — Chat API 配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `port` | `number` | 否 | `3000` | HTTP 监听端口 |
| `host` | `string` | 否 | `"127.0.0.1"` | 绑定主机地址 |
| `apiKey` | `string` | 否 | — | API 密钥（空则无认证），支持 Bearer token 和 X-API-Key 头 |
| `rateLimitWindowMs` | `number` | 否 | `60000` | 速率限制时间窗口（毫秒） |
| `rateLimitMaxRequests` | `number` | 否 | `60` | 窗口内最大请求数 |
| `corsOrigin` | `string` | 否 | `"*"` | CORS 允许的来源 |
| `staticDir` | `string` | 否 | — | 静态文件目录（绝对路径）。配置后后端托管 Web UI 静态文件。未配置时自动检测 `web/dist/` 目录 |

### system.model — 全局模型调用参数

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `timeout` | `number` | 否 | `30000` | 模型调用超时时间（毫秒） |
| `maxRetries` | `number` (0-10) | 否 | `3` | 最大重试次数（遇到限流或服务端错误时自动重试） |
| `retryBaseDelay` | `number` | 否 | `1000` | 重试基础延迟（毫秒），采用指数退避策略：`baseDelay × 2^attempt` |

### system.tool — 工具执行参数

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `defaultTimeout` | `number` | 否 | `30000` | 工具执行默认超时时间（毫秒） |
| `defaultMaxRetries` | `number` (0-5) | 否 | `0` | 工具执行默认最大重试次数 |
| `codeGenerationProvider` | `string` | 否 | — | 代码生成使用的提供商名称（createTool 时使用） |
| `codeGenerationModel` | `string` | 否 | — | 代码生成使用的模型 ID |

### system.react — ReAct 循环配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `maxIterations` | `number` | 否 | `20` | 最大迭代次数（防止无限循环） |
| `stepTimeout` | `number` | 否 | `60000` | 单步超时时间（毫秒） |
| `parallelToolCalls` | `boolean` | 否 | `true` | 是否支持并行工具调用 |
| `compressionThreshold` | `number` | 否 | `10` | 上下文压缩阈值（消息条数超过此值触发压缩） |

### system.memory — 记忆系统配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `shortTerm` | `boolean` | 否 | `true` | 是否启用短期记忆（按日期保存完整交互记录） |
| `longTerm` | `boolean` | 否 | `true` | 是否启用长期记忆（压缩摘要持续累积） |
| `hotSessionMaxTokens` | `number` | 否 | `4000` | Hot Session 最大 token 数（超出自动丢弃旧条目） |

### system.self — 自我图式配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `focusLevel` | `number` (0-100) | 否 | `60` | 激素默认值 — 专注度 |
| `cautionLevel` | `number` (0-100) | 否 | `50` | 激素默认值 — 谨慎度 |
| `creativityLevel` | `number` (0-100) | 否 | `50` | 激素默认值 — 创造力 |

### system.inspector — 审查程序配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `enabled` | `boolean` | 否 | `true` | 是否启用审查程序 |
| `checkInterval` | `number` | 否 | `180000` | 审查间隔（毫秒），默认 3 分钟 |
| `loopDetectionThreshold` | `number` | 否 | `3` | 死循环检测阈值（连续重复次数） |
| `maxRetryThreshold` | `number` | 否 | `5` | 单节点最大重试次数 |
| `minAvailableMemoryMB` | `number` | 否 | `100` | 最小可用内存（MB），低于触发告警 |
| `maxExecutionTimeSecs` | `number` | 否 | `3600` | 最大执行时间（秒），超过触发超时 |

### system.reflection — 反思程序配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `enabled` | `boolean` | 否 | `true` | 是否启用反思程序 |
| `minSkillConfidence` | `number` (0-1) | 否 | `0.7` | Skill 封装建议最低置信度 |

---

## provider — 模型提供商配置

`Record<string, ProviderConfig>` 格式。每个键为提供商名称，值为提供商配置对象。

### provider.\<name\> — 单个提供商

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `type` | `string` | 条件 | — | 提供商类型（旧格式），与 `api` 二选一 |
| `api` | 见下方协议说明 | 条件 | — | API 协议标识（新格式），与 `type` 二选一 |
| `apiKey` | `string` | 否 | — | API 密钥。OAuth 类型可通过 `npm run login` 认证 |
| `baseUrl` | `string` (URL) | 否 | 按类型自动设置 | API 基础 URL |
| `defaultModel` | `string` | 否 | 按类型自动设置 | 默认使用的模型 ID |
| `models` | `string[] \| ModelDefinition[]` | 否 | — | 可用模型列表，支持字符串或结构化定义 |

#### 提供商类型（`type` 字段值）

**API Key 类型：**

- **`openai`**: OpenAI 官方 API，默认 baseUrl 为 `https://api.openai.com/v1`
- **`openai-compatible`**: 兼容 OpenAI 格式的第三方 API（如 Ollama、vLLM、LM Studio），需设置 `baseUrl`
- **`google`**: Google Generative AI (Gemini)，默认 baseUrl 为 `https://generativelanguage.googleapis.com`
- **`mistral`**: Mistral AI API，默认 baseUrl 为 `https://api.mistral.ai/v1`
- **`groq`**: Groq 推理加速 API，默认 baseUrl 为 `https://api.groq.com/openai/v1`
- **`bedrock`**: Amazon Bedrock，需配置 AWS 凭证

**OAuth 类型（支持 `npm run login` 免密认证，也可手动配置 `apiKey`）：**

- **`openai-codex`**: OpenAI Codex API（ChatGPT Plus/Pro 订阅），支持 gpt-5.x-codex 系列模型
- **`anthropic`**: Anthropic Claude API，支持 OAuth 登录或 API Key
- **`github-copilot`**: GitHub Copilot，支持 GPT/Claude/Gemini 多种模型
- **`google-gemini-cli`**: Google Gemini CLI (Cloud Code Assist)，通过 OAuth 认证
- **`google-antigravity`**: Google Antigravity，通过 OAuth 认证，支持 Gemini + Claude 模型

#### API 协议标识（`api` 字段值）

新格式中，`api` 取代 `type`，直接标识底层 API 协议：

- `openai-completions` — OpenAI Chat Completions API
- `anthropic-messages` — Anthropic Messages API
- `google-generative-ai` — Google Generative AI API
- `mistral-completions` — Mistral Completions API
- `groq-completions` — Groq Completions API
- `bedrock-converse` — AWS Bedrock Converse API

#### 结构化模型定义（ModelDefinition）

`models` 字段支持字符串列表（旧格式）或结构化模型定义数组（新格式）：

```jsonc
{
  "models": [
    {
      "id": "gpt-4o",              // 模型 ID（必须）
      "name": "GPT-4o",            // 显示名称
      "reasoning": false,           // 是否支持 thinking/reasoning
      "input": ["text", "image"],   // 支持的输入类型
      "cost": {                     // 费用（每百万 token）
        "input": 2.5, "output": 10,
        "cacheRead": 0, "cacheWrite": 0
      },
      "contextWindow": 128000,      // 上下文窗口大小
      "maxTokens": 16384            // 最大输出 token
    }
  ]
}
```

#### OAuth 登录说明

OAuth 类型的提供商无需手动配置 API Key，通过以下命令完成认证：

```bash
# 登录指定提供商
npm run login -- openai-codex
npm run login -- anthropic
npm run login -- github-copilot
npm run login -- google-gemini-cli
npm run login -- google-antigravity

# 查看所有 OAuth 提供商状态
npm run login

# 交互式配置向导（含登录）
npm run configure
```

凭据自动保存到 `~/.ouroboros/auth.json`，Token 过期时自动刷新。

---

## agents — Agent 配置

`Record<string, AgentConfig>` 格式。**必须**包含 `default` 键（主 Agent）。支持配置多个独立 Agent。

### agents.\<name\> — 单个 Agent

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `model` | `string` | **是** | — | 使用的模型，格式: `"provider/model"`（如 `"ollama/llama3"`）。provider 必须在 `provider` 中已定义 |
| `workspacePath` | `string` | 否 | `"./workspace"` | 工作空间根目录路径 |
| `maxTurns` | `number` | 否 | `50` | 默认最大交互轮次 |
| `knowledgeMaxTokens` | `number` | 否 | `8000` | 知识库默认最大 token 数 |
| `thinkLevel` | `"off" \| "low" \| "medium" \| "high"` | 否 | `"medium"` | thinking 级别。`"off"` 禁用 thinking，其他值控制推理深度（需提供商支持） |
| `trackTokenUsage` | `boolean` | 否 | `true` | 是否记录每次对话的 Token 消耗统计 |

**模型引用格式说明：**

`model` 字段使用 `"provider/model"` 格式引用模型，其中：
- `provider` 部分是 `provider` 配置中的键名
- `model` 部分是该提供商支持的具体模型 ID

系统会自动从所有 `provider` 中提取可切换的模型列表，无需在 Agent 中单独配置。

---

## tools — 外部工具服务配置

### tools.web.search — Web 搜索配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `enabled` | `boolean` | 否 | `true` | 是否启用 Web 搜索 |
| `provider` | `"bing" \| "brave"` | 否 | `"bing"` | 搜索引擎提供商。Bing 通过 HTML 抓取无需密钥，Brave 需要 API Key |
| `apiKey` | `string` | 否 | — | 搜索 API Key（Brave 必须配置，Bing 不需要） |
| `baseUrl` | `string` (URL) | 否 | — | 自定义搜索 API 地址 |
| `maxResults` | `number` | 否 | `5` | 最大返回结果数 |
| `timeoutSeconds` | `number` | 否 | `30` | 搜索超时时间（秒） |

### tools.web.fetch — Web 抓取配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `enabled` | `boolean` | 否 | `true` | 是否启用 Web 抓取 |

---

## channels — 多通道配置

### channels.web — Web 频道

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `enabled` | `boolean` | 否 | `true` | 是否启用 Web 频道 |
| `port` | `number` | 否 | `8517` | Web 服务端口 |
| `host` | `string` | 否 | `"127.0.0.1"` | 绑定主机地址 |

### channels.tui — TUI 终端频道

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `enabled` | `boolean` | 否 | `true` | 是否启用 TUI 终端 |

### channels.telegram — Telegram 频道

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `enabled` | `boolean` | 否 | `false` | 是否启用 Telegram |
| `botToken` | `string` | 条件 | — | Bot Token（启用时必须） |
| `dmPolicy` | `"pairing" \| "open"` | 否 | `"pairing"` | 私聊策略 |
| `groupPolicy` | `"allowlist" \| "open"` | 否 | `"allowlist"` | 群组策略 |
| `streaming` | `"off" \| "partial" \| "full"` | 否 | `"partial"` | 流式输出模式 |
| `proxy` | `string` (URL) | 否 | — | Telegram 专用代理 |

---

## persistence — 持久化系统配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `enabled` | `boolean` | 否 | `true` | 是否启用状态持久化 |
| `checkpointIntervalMs` | `number` | 否 | `60000` | 检查点间隔（毫秒），默认 1 分钟 |
| `snapshotDir` | `string` | 否 | `"state"` | 快照存储目录（相对 workspace） |
| `enableAutoRecovery` | `boolean` | 否 | `true` | 是否启用自动恢复（启动时检测未完成的快照） |
| `recoveryTTLSecs` | `number` | 否 | `86400` | 恢复 TTL（秒），超过此时间的快照不尝试恢复 |
| `maxSnapshots` | `number` | 否 | `10` | 最大保留快照数，超出自动清理旧快照 |

---

## v1 → v2 配置迁移

系统自动检测旧版配置并迁移。主要变更：

| v1（旧） | v2（新） | 说明 |
|----------|----------|------|
| `providers` | `provider` | 单数 |
| `model` | `system.model` | 移入 system |
| `api` | `system.api` | 移入 system |
| `react` | `system.react` | 移入 system |
| `tools.defaultTimeout` | `system.tool.defaultTimeout` | 移入 system.tool |
| `memory` | `system.memory` | 移入 system |
| `self` | `system.self` | 移入 system |
| `inspector` | `system.inspector` | 移入 system |
| `reflection` | `system.reflection` | 移入 system |
| `webSearch` | `tools.web.search` | 重组 |
| `agents.*.think` + `thinkLevel` | `agents.*.thinkLevel` | 合并，含 `"off"` 值 |
| `providers.*.type` | `provider.*.type` 或 `api` | `api` 为新协议标识 |

旧 v1 配置文件无需手动修改，加载时自动转换为 v2 格式。

---

## 最小配置示例

使用本地 Ollama：

```json
{
  "system": {},
  "provider": {
    "ollama": {
      "type": "openai-compatible",
      "apiKey": "ollama",
      "baseUrl": "http://localhost:11434/v1",
      "defaultModel": "llama3"
    }
  },
  "agents": {
    "default": {
      "model": "ollama/llama3"
    }
  }
}
```

使用 OpenAI Codex（OAuth 模式，无 apiKey）：

```json
{
  "system": {},
  "provider": {
    "openai-codex": {
      "type": "openai-codex",
      "defaultModel": "gpt-5.3-codex",
      "models": ["gpt-5.3-codex", "gpt-5.2-codex"]
    }
  },
  "agents": {
    "default": {
      "model": "openai-codex/gpt-5.3-codex"
    }
  }
}
```

多 Agent + 结构化模型定义：

```json
{
  "provider": {
    "openai": {
      "api": "openai-completions",
      "apiKey": "${OPENAI_API_KEY}",
      "models": [
        { "id": "gpt-4o", "name": "GPT-4o", "reasoning": false, "input": ["text", "image"] }
      ]
    },
    "ollama": {
      "type": "openai-compatible",
      "apiKey": "ollama",
      "baseUrl": "http://localhost:11434/v1",
      "models": ["llama3", "qwen2.5"]
    }
  },
  "agents": {
    "default": {
      "model": "openai/gpt-4o",
      "thinkLevel": "high"
    },
    "coder": {
      "model": "ollama/llama3",
      "workspacePath": "/tmp/coder-workspace",
      "maxTurns": 100
    }
  }
}
```

## 重试策略

模型调用遇到以下情况时自动重试：
- HTTP 429（速率限制）
- HTTP 5xx（服务端错误）
- 网络超时 / 连接重置

重试使用指数退避 + 随机抖动策略，避免雷群效应。
