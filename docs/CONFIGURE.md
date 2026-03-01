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
| `type` | `"openai" \| "anthropic" \| "openai-compatible"` | **是** | — | 提供商类型 |
| `apiKey` | `string` | **是** | — | API 密钥，直接填写在配置文件中 |
| `baseUrl` | `string` (URL) | 否 | 按类型自动设置 | API 基础 URL |
| `defaultModel` | `string` | 否 | 按类型自动设置 | 默认使用的模型 ID |

#### 提供商类型说明

- **`openai`**: OpenAI 官方 API，默认 baseUrl 为 `https://api.openai.com/v1`
- **`anthropic`**: Anthropic Claude API，默认 baseUrl 为 `https://api.anthropic.com`
- **`openai-compatible`**: 兼容 OpenAI 格式的第三方 API（如 Ollama、vLLM、LM Studio），需设置 `baseUrl`

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
