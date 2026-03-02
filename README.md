# Ouroboros

自指循环 Agent 框架 — 通过模型 + 提示词 + 工具 + 程序编排，构建具备自我进化能力的智能体系统。

## 概述

Ouroboros 是一个分层递归的 Agent 框架，核心理念是**自指循环**：Agent Core 可以生成 Agent，Agent 可以生成 Super Agent，各层级之间保持自相似的形式逻辑。

### 架构层次

| 层级 | 说明 |
|------|------|
| **工具 (Tool)** | Agent 在 ReAct 过程中可调用的计算机软件/脚本集合，包含 `runAgent` 自指调用 |
| **技能 (Skill)** | 为实现特定功能的逻辑封装，包含任务编排提示词和辅助脚本 |
| **Agent** | 以特定身份提供服务的智能体，包含身份定义、知识库、技能组，支持多轮交互 |
| **Super Agent** | 垂直领域解决方案，多个 Agent 协作完成复杂任务 |

### 核心特性

- **多模型支持**: 基于 pi-ai 统一接口，支持 OpenAI、Anthropic、Google Gemini、Mistral、Groq、Bedrock 及兼容 API（Ollama、vLLM 等）
- **ReAct 循环**: Thought → Action → Observation 逐步推理
- **自指能力**: Agent 可创建工具、技能和子 Agent
- **分层记忆**: Session（Hot/Cold）、短期记忆、长期记忆
- **自我审视**: 审查程序防止偏执，反思程序总结优化
- **执行树管理**: 任务分解、回滚、终止、状态持久化与恢复

## 快速开始

### 环境要求

- Node.js >= 20
- npm >= 10

### 安装

```bash
git clone git@github.com:miwoy/ouroboros.git
cd ouroboros
npm install
```

> `@tobilu/qmd` 已作为项目依赖安装，无需全局安装。qmd 用于提示词向量语义检索，通过 `npx qmd` 调用。
> 首次使用时 qmd 会自动下载所需模型（约 2GB），包括嵌入模型、重排序模型和查询扩展模型。

### 配置

1. 复制配置模板：

```bash
cp config.example.json config.json
```

2. 编辑 `config.json`，配置模型提供商（所有配置直接写在文件中）：

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

> 详细配置说明请参阅 [docs/CONFIGURE.md](docs/CONFIGURE.md)

### 运行

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 运行测试
npm test

# 测试覆盖率
npm run test:coverage
```

## 项目结构

```
ouroboros/
├── src/                  # 源代码
│   ├── config/           # 配置系统（加载、校验、类型定义）
│   ├── model/            # 模型抽象层（多提供商统一接口）
│   │   └── providers/    # pi-ai 适配器（统一多模型接口）
│   ├── prompt/           # 提示词系统
│   │   ├── template/     # 提示词模板文件
│   │   │   ├── core.md   # 系统提示词（含内置工具/技能/解决方案，不可修改）
│   │   │   ├── self.md   # 自我图式模板（含 {{variable}} 变量）
│   │   │   ├── tool.md   # 自定义工具注册表模板
│   │   │   ├── skill.md  # 自定义技能注册表模板
│   │   │   ├── agent.md  # 自定义 Agent 注册表模板
│   │   │   └── memory.md # 长期记忆模板
│   │   ├── types.ts      # 类型定义
│   │   ├── template.ts   # 模板引擎（{{variable}} 替换）
│   │   ├── store.ts      # 存储层（文件读写 + frontmatter）
│   │   ├── loader.ts     # 加载器（加载 + 关键词/语义搜索）
│   │   ├── assembler.ts  # 装配器（按优先级拼装）
│   │   └── vector.ts     # 向量索引（qmd 集成）
│   ├── tool/             # 一级工具系统
│   │   ├── types.ts      # 类型定义（EntityCard, OuroborosTool, ToolCallRequest/Response）
│   │   ├── schema.ts     # Zod 校验（输入校验）
│   │   ├── registry.ts   # 工具注册表（内存 + 文件持久化）
│   │   ├── executor.ts   # 工具执行器（分发 + 超时 + 错误处理）
│   │   ├── converter.ts  # OuroborosTool → 模型层 ToolDefinition 转换
│   │   └── builtin/      # 内置工具实现
│   │       ├── definitions.ts  # 4 个内置工具的 OuroborosTool 定义
│   │       ├── call-model.ts   # tool:call-model — 模型调用
│   │       ├── run-agent.ts    # tool:run-agent — Agent 调用（stub）
│   │       ├── search-tool.ts  # tool:search-tool — 工具检索
│   │       └── create-tool.ts  # tool:create-tool — 工具创建
│   ├── workspace/        # workspace 初始化
│   ├── errors/           # 错误体系
│   └── index.ts          # 入口
├── tests/                # 单元测试
├── docs/                 # 文档
│   ├── DESIGN.md         # 设计文档
│   ├── CONFIGURE.md      # 配置说明
│   └── PROTOCOL.md       # 标准协议（实体接口规范）
├── workspace/            # 运行时工作空间（自动生成，不入版本控制）
│   ├── prompts/          # 用户级别提示词（扁平 .md 文件）
│   │   ├── self.md       # 自我图式
│   │   ├── tool.md       # 工具注册表
│   │   ├── skill.md      # 技能注册表
│   │   ├── agent.md      # Agent 注册表
│   │   ├── memory.md     # 长期记忆
│   │   └── memory/       # 短期记忆（按日期 yyyy-MM-dd.md）
│   ├── tools/            # 自定义工具
│   ├── skills/           # 自定义技能
│   ├── agents/           # Agent 实例及其独立工作空间
│   ├── logs/             # 日志（按日期分隔）
│   ├── tmp/              # 临时文件（任务完成后清理）
│   └── vectors/          # 向量索引（qmd，XDG_CACHE_HOME 隔离）
├── config.example.json   # 配置模板
└── ROADMAP.md            # 开发计划（不入版本控制）
```

## 提示词系统

### 提示词文件体系

| 文件 | 位置 | 说明 | qmd 索引 |
|------|------|------|----------|
| `core.md` | `src/prompt/template/` | 系统提示词（安全边界、ReAct 核心、内置工具/技能/解决方案），直接引用不复制 | 否 |
| `self.md` | `workspace/prompts/` | 自我图式（身体图式+灵魂图式+激素），含 {{variable}} 变量，运行时更新 | 否 |
| `tool.md` | `workspace/prompts/` | 自定义工具注册表，动态累加，无变量 | 是 |
| `skill.md` | `workspace/prompts/` | 自定义技能注册表，动态累加，无变量 | 是 |
| `agent.md` | `workspace/prompts/` | 自定义 Agent 注册表，量小直接加载，无变量 | 否 |
| `memory.md` | `workspace/prompts/` | 长期记忆（压缩摘要），动态累加，无变量 | 是 |
| `memory/*.md` | `workspace/prompts/memory/` | 短期记忆（按日期文件），详细交互，无变量 | 是 |

> **注意**: 内置工具、技能、解决方案的描述在 `core.md` 中，不暴露给用户修改。`tool.md`、`skill.md`、`agent.md` 仅记录用户自定义的内容。

### qmd 向量索引

- `@tobilu/qmd` 作为项目依赖，通过 `npx qmd` 调用
- 索引存储在 `workspace/vectors/` 下（通过 `XDG_CACHE_HOME` 环境隔离）
- 只索引 tool.md、skill.md、memory.md 和 memory/ 目录
- `initVectorIndex` 幂等，不重复创建已有 collection
- `collection add` 后需显式 `embed`

## 一级工具系统

### 四个系统原语

| 工具 ID | 名称 | 说明 |
|---------|------|------|
| `tool:call-model` | 模型调用 | 调用大语言模型进行推理和生成 |
| `tool:run-agent` | Agent 调用 | 调用指定 Agent 执行任务（阶段四实现） |
| `tool:search-tool` | 工具检索 | qmd 语义搜索 + 关键词匹配工具库 |
| `tool:create-tool` | 工具创建 | 动态创建 .js 工具脚本并注册 |

### 工具调用协议

所有工具通过统一的 `ToolCallRequest` / `ToolCallResponse` 协议调用：

```typescript
const response = await executor.execute({
  requestId: "req-001",
  toolId: "tool:call-model",
  input: { messages: [{ role: "user", content: "你好" }] },
  caller: { entityId: "agent:core" },
});
```

### 自定义工具

通过 `tool:create-tool` 动态创建工具：
- 生成 `.js` ES Module 脚本（`export default async function(input, context) { ... }`）
- 动态 import 校验导出格式
- SHA-256 代码签名存入 metadata
- 自动注册到 `workspace/tools/registry.json` 和 `prompts/tool.md`

### 类型转换

`toModelToolDefinition()` 将 `OuroborosTool` 转换为模型层 `ToolDefinition`，供 `callModel` 的 `tools` 参数使用。

## 文档

| 文档 | 位置 | 说明 |
|------|------|------|
| [DESIGN](docs/DESIGN.md) | docs/ | 系统设计文档 |
| [CONFIGURE](docs/CONFIGURE.md) | docs/ | 配置项说明 |
| [PROTOCOL](docs/PROTOCOL.md) | docs/ | 标准协议（实体接口规范） |

## 开发

```bash
# 运行测试
npm test

# 监视模式
npm run test:watch

# 覆盖率报告
npm run test:coverage

# 代码检查
npm run lint

# 格式化
npm run format
```

## 许可证

ISC
