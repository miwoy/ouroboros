# Ouroboros 配置说明（CONFIGURE）

Ouroboros 使用项目根目录下的 `config.json` 进行配置。首次使用时，复制 `config.example.json` 并重命名为 `config.json`，根据需要修改各项配置。

所有配置项直接写在 `config.json` 中，支持但不强制使用 `${ENV_VAR}` 格式引用环境变量（环境变量未设置时保留原值）。

---

## 配置项一览

### system — 系统配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `logLevel` | `"debug" \| "info" \| "warn" \| "error"` | 否 | `"info"` | 日志输出级别 |
| `workspacePath` | `string` | 否 | `"./workspace"` | 工作空间根目录路径 |

### model — 模型配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `defaultProvider` | `string` | **是** | — | 默认使用的提供商名称，必须在 `providers` 中已定义 |
| `timeout` | `number` | 否 | `30000` | 模型调用超时时间（毫秒） |
| `maxRetries` | `number` (0-10) | 否 | `3` | 最大重试次数（遇到限流或服务端错误时自动重试） |
| `retryBaseDelay` | `number` | 否 | `1000` | 重试基础延迟（毫秒），采用指数退避策略：`baseDelay × 2^attempt` |
| `providers` | `Record<string, Provider>` | **是** | — | 已注册的模型提供商列表 |

### model.providers.\<name\> — 提供商配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `type` | `"openai" \| "anthropic" \| "openai-compatible" \| "google" \| "mistral" \| "groq" \| "bedrock"` | **是** | — | 提供商类型 |
| `apiKey` | `string` | **是** | — | API 密钥，直接填写在配置文件中 |
| `baseUrl` | `string` (URL) | 否 | 按类型自动设置 | API 基础 URL |
| `defaultModel` | `string` | 否 | 按类型自动设置 | 默认使用的模型 ID |
| `models` | `string[]` | 否 | — | 该提供商可用的模型列表，供 client 展示切换 |

#### 提供商类型说明

- **`openai`**: OpenAI 官方 API，默认 baseUrl 为 `https://api.openai.com/v1`
- **`anthropic`**: Anthropic Claude API，默认 baseUrl 为 `https://api.anthropic.com`
- **`openai-compatible`**: 兼容 OpenAI 格式的第三方 API（如 Ollama、vLLM、LM Studio），需设置 `baseUrl`
- **`google`**: Google Generative AI (Gemini)，默认 baseUrl 为 `https://generativelanguage.googleapis.com`
- **`mistral`**: Mistral AI API，默认 baseUrl 为 `https://api.mistral.ai/v1`
- **`groq`**: Groq 推理加速 API，默认 baseUrl 为 `https://api.groq.com/openai/v1`
- **`bedrock`**: Amazon Bedrock，需配置 AWS 凭证

---

### tools — 工具配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `defaultTimeout` | `number` | 否 | `30000` | 工具执行默认超时时间（毫秒） |
| `defaultMaxRetries` | `number` (0-5) | 否 | `0` | 工具执行默认最大重试次数 |
| `codeGenerationProvider` | `string` | 否 | — | 代码生成使用的提供商名称（createTool 时使用），默认使用 model.defaultProvider |
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

### agents — Agent 系统配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `defaultMaxTurns` | `number` | 否 | `50` | Agent 默认最大交互轮次 |
| `knowledgeMaxTokens` | `number` | 否 | `8000` | 知识库默认最大 token 数 |

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

### superAgents — Super Agent 系统配置

| 字段 | 类型 | 必须 | 默认值 | 描述 |
|------|------|------|--------|------|
| `defaultMaxDuration` | `number` | 否 | `600` | 默认总执行时间上限（秒） |
| `maxParallelAgents` | `number` | 否 | `5` | 最大并行 Agent 数（parallel 模式） |

---

## 最小配置示例

使用本地 Ollama：

```json
{
  "system": {},
  "model": {
    "defaultProvider": "ollama",
    "providers": {
      "ollama": {
        "type": "openai-compatible",
        "apiKey": "ollama",
        "baseUrl": "http://localhost:11434/v1",
        "defaultModel": "llama3"
      }
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
