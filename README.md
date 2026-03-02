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
│   │       ├── definitions.ts  # 一级工具的 OuroborosTool 定义
│   │       ├── secondary-definitions.ts  # 二级工具的 OuroborosTool 定义
│   │       ├── call-model.ts   # tool:call-model — 模型调用
│   │       ├── run-agent.ts    # tool:run-agent — Agent 调用（stub）
│   │       ├── search-tool.ts  # tool:search-tool — 工具检索
│   │       ├── create-tool.ts  # tool:create-tool — 工具创建
│   │       ├── bash.ts         # tool:bash — 命令执行
│   │       ├── read.ts         # tool:read — 文件读取
│   │       ├── write.ts        # tool:write — 文件写入
│   │       ├── edit.ts         # tool:edit — 文件编辑
│   │       ├── find.ts         # tool:find — 文件查找
│   │       ├── web-search.ts   # tool:web-search — 搜索引擎
│   │       ├── web-fetch.ts    # tool:web-fetch — URL 抓取
│   │       ├── search-skill.ts # tool:search-skill — 技能检索
│   │       └── create-skill.ts # tool:create-skill — 技能创建
│   ├── skill/            # 技能系统
│   │   ├── types.ts      # 类型定义（SkillDefinition, SkillExecuteRequest/Response）
│   │   ├── registry.ts   # 技能注册表（内存 + workspace/skills/ 加载）
│   │   ├── executor.ts   # 技能执行器（模板渲染 + ReAct 循环）
│   │   └── builtin/      # 内置技能
│   │       └── definitions.ts  # createSolution 等内置技能定义
│   ├── solution/         # Agent (Solution) 系统
│   │   ├── types.ts      # 类型定义（SolutionDefinition, Agent, Task）
│   │   ├── registry.ts   # Solution 注册表（持久化 + agent.md 追加）
│   │   ├── knowledge.ts  # 知识库管理（文件加载 + token 限制）
│   │   ├── builder.ts    # Agent 构建器（工作空间创建 + 初始化）
│   │   ├── executor.ts   # Agent 执行器（ReAct 循环集成）
│   │   └── index.ts      # 公共导出
│   ├── memory/           # 记忆系统
│   │   ├── types.ts      # 类型定义（HotMemory, ColdMemory, ShortTermMemory, LongTermMemory）
│   │   ├── session.ts    # Session 记忆（Hot: 内存常驻, Cold: 临时文件缓存）
│   │   ├── short-term.ts # 短期记忆（按日期文件持久化）
│   │   ├── long-term.ts  # 长期记忆（压缩摘要）
│   │   ├── manager.ts    # 记忆管理器（四层统一管理）
│   │   └── index.ts      # 公共导出
│   ├── core/             # ReAct 核心循环
│   │   ├── types.ts      # 类型定义（ExecutionTree, ReactResult 等）
│   │   ├── execution-tree.ts  # 执行树管理（纯函数，不可变操作）
│   │   ├── exception.ts  # 异常处理（回滚、终止、死循环检测）
│   │   ├── context-compression.ts  # 上下文压缩（摘要累加）
│   │   └── loop.ts       # ReAct 核心循环实现
│   ├── logger/           # 日志系统
│   │   ├── types.ts      # 类型定义（LogLevel, Logger 接口）
│   │   └── logger.ts     # 文件日志实现（JSONL 格式）
│   ├── schema/           # 自我图式系统
│   │   ├── types.ts      # 类型定义（BodySchema, SoulSchema, HormoneState）
│   │   ├── body.ts       # 身体图式（系统资源感知）
│   │   ├── soul.ts       # 灵魂图式（世界模型+自我认知）
│   │   ├── hormone.ts    # 激素系统（决策倾向调节）
│   │   └── schema-provider.ts  # 统一提供者（模板变量输出）
│   ├── inspector/        # 审查程序
│   │   ├── types.ts      # 类型定义（InspectorConfig, InspectionResult）
│   │   ├── rules.ts      # 审查规则（死循环/高重试/超时/资源耗尽）
│   │   └── inspector.ts  # 审查核心（定时调度+规则执行）
│   ├── reflection/       # 反思程序
│   │   ├── types.ts      # 类型定义（ReflectionInput/Output, SkillSuggestion）
│   │   └── reflector.ts  # 反思执行器（分析+记忆写入+Skill建议）
│   ├── super-agent/      # Super Agent 协作系统
│   │   ├── types.ts      # 类型定义（SuperAgentDefinition, AgentRole, CollaborationSpec）
│   │   ├── registry.ts   # Super Agent 注册表（持久化 + 状态管理）
│   │   ├── builder.ts    # Super Agent 构建器（工作空间 + config + metadata）
│   │   ├── executor.ts   # 协作执行器（串行/并行/编排模式）
│   │   └── index.ts      # 公共导出
│   ├── persistence/      # 状态持久化与恢复
│   │   ├── types.ts      # 类型定义（SystemStateSnapshot, PersistenceConfig）
│   │   ├── integrity.ts  # 完整性校验（SHA-256 校验和）
│   │   ├── snapshot.ts   # 快照创建与序列化
│   │   ├── manager.ts    # 持久化管理器（保存/加载/清理）
│   │   ├── recovery.ts   # 恢复管理器（检测/恢复/标记）
│   │   ├── shutdown.ts   # 优雅关闭处理器（SIGINT/SIGTERM）
│   │   └── index.ts      # 公共导出
│   ├── api/              # Chat API 层
│   │   ├── types.ts      # 类型定义（ApiResponse, SSEEvent, ApiConfig）
│   │   ├── response.ts   # 统一响应构建器
│   │   ├── router.ts     # HTTP 路由器（路径参数匹配）
│   │   ├── middleware.ts  # 中间件（认证、速率限制、CORS）
│   │   ├── formatter.ts  # 响应格式化（Markdown）
│   │   ├── session.ts    # 会话管理（内存）
│   │   ├── handlers.ts   # 路由处理器（REST API 端点）
│   │   ├── server.ts     # HTTP 服务器
│   │   └── index.ts      # 公共导出
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
│   ├── solutions/        # Solution 注册表
│   ├── super-agents/     # Super Agent 协作实例
│   ├── state/            # 状态持久化（快照+完整性校验）
│   ├── logs/             # 日志（按日期分隔）
│   ├── tmp/              # 临时文件（任务完成后清理）
│   └── vectors/          # 向量索引（qmd，XDG_CACHE_HOME 隔离）
├── web/                  # Web UI 客户端（React + Vite）
│   ├── src/
│   │   ├── components/   # UI 组件（Header, Sidebar, ChatView）
│   │   ├── pages/        # 页面（AgentsPage, MonitorPage）
│   │   ├── hooks/        # React Hooks（useChat）
│   │   ├── services/     # API 客户端
│   │   └── styles/       # 主题与全局样式
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
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

### 二级工具

基于一级工具能力构建的常用操作工具集：

| 工具 ID | 名称 | 说明 |
|---------|------|------|
| `tool:bash` | 命令执行 | 在子进程中执行 shell 命令，支持超时控制 |
| `tool:read` | 文件读取 | 读取指定文件内容，支持行范围限制 |
| `tool:write` | 文件写入 | 将内容写入文件（覆盖），自动创建父目录 |
| `tool:edit` | 文件编辑 | 精确字符串替换（差异修改） |
| `tool:find` | 文件查找 | 使用 glob 模式在 workspace 中查找文件 |
| `tool:web-search` | 搜索引擎 | 检索互联网信息，返回标题、摘要和链接 |
| `tool:web-fetch` | URL 抓取 | 获取指定 URL 的网页内容 |
| `tool:search-skill` | 技能检索 | 在技能库中搜索匹配的技能 |
| `tool:create-skill` | 技能创建 | 创建新的自定义技能并注册 |

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

## 技能系统

Skill 是工具编排的逻辑封装，包含提示词模板和可选辅助脚本。

### 核心概念

- **SkillDefinition**：技能定义（提示词模板 + 变量声明 + 依赖工具列表）
- **SkillRegistry**：技能注册表（内置技能 + workspace/skills/ 用户技能）
- **SkillExecutor**：技能执行器（模板渲染 → 工具筛选 → ReAct 循环执行）

### 使用示例

```typescript
import { createSkillRegistry, createSkillExecutor } from "ouroboros";

const skillRegistry = await createSkillRegistry(workspacePath);
const skillExecutor = createSkillExecutor({
  skillRegistry, toolRegistry, toolExecutor, callModel, logger, workspacePath,
});

const response = await skillExecutor.execute({
  requestId: "req-001",
  skillId: "skill:文件摘要",
  variables: { filePath: "docs/DESIGN.md" },
  caller: { entityId: "agent:core" },
});

console.log(response.result);    // 摘要内容
console.log(response.toolCalls); // 执行过程中的工具调用记录
```

## ReAct 核心循环

Agent 通过 Thought → Action → Observation 循环逐步推理解决问题。

### 核心特性

- **执行树管理**：不可变纯函数操作，跟踪任务分解和执行状态
- **并行工具调用**：模型返回多个工具调用时通过 `Promise.all` 并行执行
- **上下文压缩**：消息历史超过阈值时自动摘要压缩，保留关键信息
- **死循环检测**：连续 3 次相同工具+相同参数调用触发异常报告
- **异常处理**：支持回滚、终止子树、终止整棵树等操作

### 使用示例

```typescript
import { runReactLoop, type ReactLoopConfig, type ReactDependencies } from "ouroboros";

const result = await runReactLoop(
  "查询今天的日期并写入文件",
  systemPrompt,
  tools,
  { maxIterations: 20, stepTimeout: 60000, parallelToolCalls: true, compressionThreshold: 10, agentId: "agent:core" },
  { callModel, toolExecutor, toolRegistry, logger, workspacePath },
);

console.log(result.answer);      // 最终回答
console.log(result.steps);       // 每个步骤的工具调用
console.log(result.executionTree); // 执行树
```

## Agent (Solution) 系统

Agent 是以特定身份提供服务的智能体，包含身份定义、知识库、技能组，通过 ReAct 循环自主执行任务。

### 核心概念

- **SolutionDefinition**：Agent 定义（身份提示词 + 知识库 + 技能组 + 交互模式）
- **SolutionRegistry**：Agent 注册表（内存 + solutions/registry.json 持久化）
- **KnowledgeBase**：知识库管理（静态文件 + token 预算控制）
- **AgentExecutor**：任务执行器（构建上下文 → 筛选工具 → ReAct 循环）

### 使用示例

```typescript
import {
  createSolutionRegistry, buildAgent, createAgentExecutor
} from "ouroboros";

// 1. 注册 Agent 定义
const registry = await createSolutionRegistry(workspacePath);
await registry.register({
  id: "solution:code-reviewer",
  identityPrompt: "你是一位代码审查专家",
  skills: ["skill:read-file"],
  interaction: { multiTurn: true, humanInLoop: false, inputModes: ["text"], outputModes: ["text"] },
  // ...其他 EntityCard 字段
});

// 2. 构建 Agent 实例（创建工作空间目录、配置文件）
const agent = await buildAgent(definition, workspacePath);

// 3. 通过 run-agent 工具执行任务
const executor = createAgentExecutor(deps);
const response = await executor.execute({
  agentId: "solution:code-reviewer",
  task: "审查 src/index.ts 的代码质量",
});

console.log(response.result);           // Agent 的回答
console.log(response.task.state);        // "completed"
console.log(response.executionTree);     // 执行树
```

## 记忆系统

四层分层记忆架构，从高频内存到持久文件逐级过渡。

### 记忆层级

| 层级 | 存储 | 生命周期 | 说明 |
|------|------|----------|------|
| **Hot Memory** | 内存 | 每次 callModel 注入 | 实时记忆，token 限制自动淘汰旧条目 |
| **Cold Memory** | tmp/memory/ | 任务结束清理 | 步骤级缓存，按需加载 |
| **短期记忆** | prompts/memory/*.md | 持久（按日期） | 完整交互记录，按日期分文件 |
| **长期记忆** | prompts/memory.md | 持久（累积） | 压缩摘要：知识、行为模式、决策 |

### 使用示例

```typescript
import { createMemoryManager } from "ouroboros";

const memoryManager = createMemoryManager(workspacePath, {
  shortTerm: true,
  longTerm: true,
  hotSessionMaxTokens: 4000,
});

// Hot Memory — 实时注入 callModel
memoryManager.hot.add({ timestamp: "...", type: "conversation", content: "..." });
const promptText = memoryManager.hot.toPromptText();

// 短期记忆 — 追加交互记录
await memoryManager.shortTerm.append({ timestamp: "...", type: "tool-call", content: "..." });
const todayEntries = await memoryManager.shortTerm.loadToday();

// 长期记忆 — 压缩摘要
await memoryManager.longTerm.appendKnowledge("项目采用分层架构");
const summary = await memoryManager.longTerm.compressFromShortTerm("2026-03-02", callModel);

// 任务结束时清理
await memoryManager.cleanup();
```

## Super Agent 协作系统

Super Agent 是多 Agent 协作的编排体，用于实现垂直领域的完整解决方案。

### 协作模式

| 模式 | 说明 |
|------|------|
| **sequential** | 按依赖拓扑排序串行执行，前置 Agent 输出作为后续输入 |
| **parallel** | 无依赖 Agent 并行执行（按层级分组），有依赖的等待 |
| **orchestrated** | 由指定编排 Agent 动态分配任务和调度执行 |

### 使用示例

```typescript
import {
  createSuperAgentRegistry, buildSuperAgent, createSuperAgentExecutor
} from "ouroboros";

// 1. 注册 Super Agent 定义
const registry = await createSuperAgentRegistry(workspacePath);
await registry.register({
  id: "super-agent:blog-writer",
  responsibilityPrompt: "负责博客文章制作的协作",
  agents: [
    { roleName: "researcher", responsibility: "调研信息", agentId: "solution:researcher" },
    { roleName: "writer", responsibility: "撰写内容", agentId: "solution:writer", dependsOn: ["researcher"] },
    { roleName: "reviewer", responsibility: "审查内容", agentId: "solution:reviewer", dependsOn: ["writer"] },
  ],
  collaboration: {
    mode: "sequential",
    conflictResolution: { strategy: "orchestrator-decides", timeout: 60 },
    constraints: { maxParallelAgents: 3 },
  },
  // ...其他 EntityCard 字段
});

// 2. 构建 Super Agent 实例
const instance = await buildSuperAgent(definition, workspacePath);

// 3. 执行协作任务
const executor = createSuperAgentExecutor(deps);
const response = await executor.execute({
  superAgentId: "super-agent:blog-writer",
  task: "写一篇关于人工智能的博客",
});

console.log(response.result);       // 汇总结果
console.log(response.roleResults);  // 各角色结果
console.log(response.success);      // 是否全部成功
```

## 自我图式系统

Agent 的自我感知：身体图式（运行环境）、灵魂图式（世界模型+自我认知）、激素系统（决策倾向）。

```typescript
import { createSchemaProvider } from "ouroboros";

const provider = createSchemaProvider(workspacePath, {
  hormoneDefaults: { focusLevel: 70, cautionLevel: 40, creativityLevel: 60 },
});

// 获取模板变量（用于渲染 self.md）
const vars = provider.getVariables();
// { platform, availableMemory, workspacePath, worldModel, selfAwareness, focusLevel, cautionLevel, creativityLevel }

// 动态调整激素
const hormones = provider.getHormoneManager();
hormones.adjustCaution(10); // 检测到风险时增加谨慎度
```

## 审查与反思系统

审查程序定时检查执行树，检测死循环、超时、资源耗尽等异常。反思程序在任务完成后分析执行过程，更新长期记忆和建议 Skill 封装。

```typescript
import { createInspector, createReflector } from "ouroboros";

// 审查程序
const inspector = createInspector(logger);
const result = inspector.inspect({ tree, bodySchema, startTime, config });
// result.hasAnomalies, result.reports, result.suggestedActions

// 反思程序
const reflector = createReflector({ callModel, longTermMemory, logger });
const output = await reflector.reflect({ taskDescription, steps, result, ... });
// output.insights, output.patterns, output.skillSuggestions, output.memorySummary
```

## 状态持久化与恢复

系统状态持久化确保长时间运行的任务在中断后能恢复继续，不丢失已完成的进度。

### 核心特性

- **状态快照**：将 Agent 依赖树 + 执行树序列化为 JSON 快照
- **原子写入**：.tmp → rename 模式，防止写入过程中断导致文件损坏
- **完整性校验**：SHA-256 校验和验证快照文件完整性
- **自动恢复**：启动时检测未完成的快照，自动恢复到中断点
- **优雅关闭**：SIGINT/SIGTERM 信号触发状态保存后安全退出
- **过期清理**：自动清理超限的旧快照，保留最新 N 个

### 使用示例

```typescript
import {
  createPersistenceManager, createRecoveryManager, createShutdownHandler,
  createSnapshot, DEFAULT_PERSISTENCE_CONFIG,
} from "ouroboros";

// 1. 创建持久化管理器
const pm = createPersistenceManager({
  logger, workspacePath, config: DEFAULT_PERSISTENCE_CONFIG,
});

// 2. 保存快照
const snapshot = createSnapshot({
  trigger: "tool-completed",
  startTime: Date.now(),
  taskDescription: "5步文件创建任务",
  agents: [{ agentId: "agent-1", name: "Writer", executionTree, ... }],
  rootAgentIds: ["agent-1"],
});
await pm.saveSnapshot(snapshot);

// 3. 恢复
const recovery = createRecoveryManager(pm, deps);
if (await recovery.hasRecoverableSnapshot()) {
  const result = await recovery.recover();
  // result.success, result.restoredAgentCount, result.skippedStepCount
}

// 4. 优雅关闭
const handler = createShutdownHandler();
handler.register(async () => {
  await pm.saveSnapshot(createSnapshot({ trigger: "graceful-shutdown", ... }));
});
```

## Chat API 层

基于 Node.js 原生 `http` 模块的 RESTful API，支持消息处理、会话管理和 SSE 流式输出。

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/sessions` | 创建会话 |
| GET | `/api/sessions` | 列出会话 |
| GET | `/api/sessions/:id` | 获取会话详情 |
| POST | `/api/sessions/:id/delete` | 删除会话 |
| POST | `/api/chat/message` | 发送消息（支持 `stream: true` 流式） |
| GET | `/api/chat/messages/:sessionId` | 获取消息历史（分页） |
| GET | `/api/agents` | 列出 Agent |
| GET | `/api/agents/:agentId` | 获取 Agent 详情 |

### 使用示例

```typescript
import { createApiServer } from "ouroboros";

const server = createApiServer({
  logger,
  workspacePath: "./workspace",
  config: {
    port: 3000,
    host: "127.0.0.1",
    apiKey: "my-secret-key", // 可选，空则无认证
    rateLimit: { windowMs: 60000, maxRequests: 60 },
    corsOrigin: "*",
  },
});

await server.start();
// API 服务器已启动: http://127.0.0.1:3000

// 发送消息
const res = await fetch("http://127.0.0.1:3000/api/chat/message", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer my-secret-key",
  },
  body: JSON.stringify({ message: "你好", stream: false }),
});
const body = await res.json();
// { success: true, data: { sessionId: "...", response: "...", formatted: "..." }, error: null }
```

## Web UI 客户端

基于 React + Vite + TypeScript 的 Web 界面，提供对话、Agent 管理与系统监控功能。

### 功能

- **Chat 对话界面**：消息输入、SSE 流式输出、Markdown 渲染（react-markdown）、代码高亮（highlight.js）
- **Agent 管理面板**：查看 Agent 列表、状态、技能信息
- **系统监控**：健康检查、版本信息、运行时间、连接状态
- **会话管理**：侧边栏会话列表，创建/切换/删除会话
- **响应式设计**：支持桌面和移动端

### 启动

```bash
# 先启动后端 API 服务器
npm run dev

# 启动 Web UI（另一个终端）
cd web
npm install
npm run dev
# 访问 http://localhost:5173
```

开发模式下，Vite 会自动代理 `/api` 请求到后端 `http://127.0.0.1:3000`。

### 构建

```bash
cd web
npm run build
# 产出目录: web/dist/
```

## 日志系统

日志写入 `workspace/logs/yyyy-MM-dd.log`，JSONL 格式，异步写入不阻塞主循环。

```typescript
import { createLogger } from "ouroboros";

const logger = createLogger("./workspace", "info");
logger.info("react-loop", "循环开始", { task: "..." });
```

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
