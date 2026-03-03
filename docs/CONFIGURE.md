# Ouroboros 配置说明（CONFIGURE）

Ouroboros 使用项目根目录下的 `config.json` 进行配置。首次使用时，复制 `config.example.json` 并重命名为 `config.json`，根据需要修改各项配置。

所有配置项直接写在 `config.json` 中，支持但不强制使用 `${ENV_VAR}` 格式引用环境变量（环境变量未设置时保留原值）。

---

## 配置项一览

### system — 系统配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `logLevel` | `"debug" \| "info" \| "warn" \| "error"` | 否 | `"info"` | 日志输出级别 |
| `proxy` | `string` (URL) | 否 | — | HTTP 代理地址，配置后系统所有对外请求使用此代理。空字符串视为未配置 |

### providers — 模型提供商配置

根级别配置，`Record<string, Provider>` 格式。每个键为提供商名称，值为提供商配置对象。

#### providers.\<name\> — 单个提供商

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `type` | 见下方类型说明 | **是** | — | 提供商类型 |
| `apiKey` | `string` | 条件 | — | API 密钥。OAuth 类型可选（通过 `npm run login` 认证），其他类型必须 |
| `baseUrl` | `string` (URL) | 否 | 按类型自动设置 | API 基础 URL |
| `defaultModel` | `string` | 否 | 按类型自动设置 | 默认使用的模型 ID |
| `models` | `string[]` | 否 | — | 该提供商可用的模型列表，供 client 展示切换 |

#### 提供商类型说明

**API Key 类型（需配置 `apiKey`）：**

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

### agents — Agent 配置

根级别配置，`Record<string, AgentConfig>` 格式。**必须**包含 `default` 键（主 Agent）。支持配置多个独立 Agent。

#### agents.\<name\> — 单个 Agent

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `model` | `string` | **是** | — | 使用的模型，格式: `"provider/model"`（如 `"ollama/llama3"`）。provider 必须在 `providers` 中已定义 |
| `workspacePath` | `string` | 否 | `"./workspace"` | 工作空间根目录路径 |
| `maxTurns` | `number` | 否 | `50` | 默认最大交互轮次 |
| `knowledgeMaxTokens` | `number` | 否 | `8000` | 知识库默认最大 token 数 |
| `think` | `boolean` | 否 | `false` | 启用模型 thinking/reasoning 能力。开启后模型会在回答前进行内部推理（需提供商支持） |
| `thinkLevel` | `"low" \| "medium" \| "high"` | 否 | `"medium"` | thinking 级别，控制推理深度。仅在 `think: true` 时生效 |
| `trackTokenUsage` | `boolean` | 否 | `true` | 是否记录每次对话的 Token 消耗统计 |

**模型引用格式说明：**

`model` 字段使用 `"provider/model"` 格式引用模型，其中：
- `provider` 部分是 `providers` 配置中的键名
- `model` 部分是该提供商支持的具体模型 ID

系统会自动从所有 `providers` 中提取可切换的模型列表，无需在 Agent 中单独配置。

### model — 全局模型调用参数

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `timeout` | `number` | 否 | `30000` | 模型调用超时时间（毫秒） |
| `maxRetries` | `number` (0-10) | 否 | `3` | 最大重试次数（遇到限流或服务端错误时自动重试） |
| `retryBaseDelay` | `number` | 否 | `1000` | 重试基础延迟（毫秒），采用指数退避策略：`baseDelay × 2^attempt` |

---

### tools — 工具配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `defaultTimeout` | `number` | 否 | `30000` | 工具执行默认超时时间（毫秒） |
| `defaultMaxRetries` | `number` (0-5) | 否 | `0` | 工具执行默认最大重试次数 |
| `codeGenerationProvider` | `string` | 否 | — | 代码生成使用的提供商名称（createTool 时使用） |
| `codeGenerationModel` | `string` | 否 | — | 代码生成使用的模型 ID |

---

### react — ReAct 循环配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `maxIterations` | `number` | 否 | `20` | 最大迭代次数（防止无限循环） |
| `stepTimeout` | `number` | 否 | `60000` | 单步超时时间（毫秒） |
| `parallelToolCalls` | `boolean` | 否 | `true` | 是否支持并行工具调用 |
| `compressionThreshold` | `number` | 否 | `10` | 上下文压缩阈值（消息条数超过此值触发压缩） |

---

### memory — 记忆系统配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `shortTerm` | `boolean` | 否 | `true` | 是否启用短期记忆（按日期保存完整交互记录） |
| `longTerm` | `boolean` | 否 | `true` | 是否启用长期记忆（压缩摘要持续累积） |
| `hotSessionMaxTokens` | `number` | 否 | `4000` | Hot Session 最大 token 数（超出自动丢弃旧条目） |

---

### self — 自我图式配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `focusLevel` | `number` (0-100) | 否 | `60` | 激素默认值 — 专注度 |
| `cautionLevel` | `number` (0-100) | 否 | `50` | 激素默认值 — 谨慎度 |
| `creativityLevel` | `number` (0-100) | 否 | `50` | 激素默认值 — 创造力 |

---

### inspector — 审查程序配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `enabled` | `boolean` | 否 | `true` | 是否启用审查程序 |
| `checkInterval` | `number` | 否 | `180000` | 审查间隔（毫秒），默认 3 分钟 |
| `loopDetectionThreshold` | `number` | 否 | `3` | 死循环检测阈值（连续重复次数） |
| `maxRetryThreshold` | `number` | 否 | `5` | 单节点最大重试次数 |
| `minAvailableMemoryMB` | `number` | 否 | `100` | 最小可用内存（MB），低于触发告警 |
| `maxExecutionTimeSecs` | `number` | 否 | `3600` | 最大执行时间（秒），超过触发超时 |

---

### reflection — 反思程序配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `enabled` | `boolean` | 否 | `true` | 是否启用反思程序 |
| `minSkillConfidence` | `number` (0-1) | 否 | `0.7` | Skill 封装建议最低置信度 |

---

### api — Chat API 配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `port` | `number` | 否 | `3000` | HTTP 监听端口 |
| `host` | `string` | 否 | `"127.0.0.1"` | 绑定主机地址 |
| `apiKey` | `string` | 否 | — | API 密钥（空则无认证），支持 Bearer token 和 X-API-Key 头 |
| `rateLimitWindowMs` | `number` | 否 | `60000` | 速率限制时间窗口（毫秒） |
| `rateLimitMaxRequests` | `number` | 否 | `60` | 窗口内最大请求数 |
| `corsOrigin` | `string` | 否 | `"*"` | CORS 允许的来源 |

---

### webSearch — Web 搜索配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `provider` | `"bing" \| "brave"` | 否 | `"bing"` | 搜索引擎提供商。Bing 通过 HTML 抓取无需密钥，Brave 需要 API Key |
| `apiKey` | `string` | 否 | — | 搜索 API Key（Brave 必须配置，Bing 不需要） |
| `baseUrl` | `string` (URL) | 否 | — | 自定义搜索 API 地址（可选） |

---

### persistence — 持久化系统配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `enabled` | `boolean` | 否 | `true` | 是否启用状态持久化 |
| `checkpointIntervalMs` | `number` | 否 | `60000` | 检查点间隔（毫秒），默认 1 分钟 |
| `snapshotDir` | `string` | 否 | `"state"` | 快照存储目录（相对 workspace） |
| `enableAutoRecovery` | `boolean` | 否 | `true` | 是否启用自动恢复（启动时检测未完成的快照） |
| `recoveryTTLSecs` | `number` | 否 | `86400` | 恢复 TTL（秒），超过此时间的快照不尝试恢复 |
| `maxSnapshots` | `number` | 否 | `10` | 最大保留快照数，超出自动清理旧快照 |

---

## 最小配置示例

使用本地 Ollama：

```json
{
  "system": {},
  "providers": {
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
  "providers": {
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

多 Agent 配置示例：

```json
{
  "providers": {
    "openai": {
      "type": "openai",
      "apiKey": "sk-xxx",
      "models": ["gpt-4o", "gpt-4o-mini"]
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
      "think": true,
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
