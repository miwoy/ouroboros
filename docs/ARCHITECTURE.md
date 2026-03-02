<p align="center">
  <img src="../logo.png" alt="Ouroboros" width="160" />
</p>

# Ouroboros 架构文档

## 概述

Ouroboros 是一个自指循环 Agent 框架，核心理念是 **模型 + 提示词 + 工具 + 程序编排**。系统采用四层实体架构（Tool → Skill → Solution → Super Agent），通过 ReAct 循环驱动推理和行动，具备自我感知、记忆管理、状态持久化等能力。

## 系统分层

```
┌─────────────────────────────────────────────────────┐
│                    客户端层                           │
│   Web UI (React)  │  TUI (readline)  │  API 直连     │
├─────────────────────────────────────────────────────┤
│                  API / 通信层                         │
│   REST API  │  SSE 流式  │  WebSocket 实时推送        │
├─────────────────────────────────────────────────────┤
│                  业务编排层                           │
│   ReAct 循环  │  审查程序  │  反思器  │  记忆管理      │
├─────────────────────────────────────────────────────┤
│                  实体层（四层协议）                    │
│   Tool  →  Skill  →  Solution (Agent)  →  Super Agent │
├─────────────────────────────────────────────────────┤
│                  基础设施层                           │
│   模型抽象  │  提示词系统  │  配置  │  持久化  │  日志  │
└─────────────────────────────────────────────────────┘
```

## 目录结构

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
│   │       ├── run-agent.ts    # tool:run-agent — Agent 调用
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
│   ├── super-agent/      # Super Agent 协作系统
│   │   ├── types.ts      # 类型定义（SuperAgentDefinition, AgentRole）
│   │   ├── registry.ts   # Super Agent 注册表（持久化 + 状态管理）
│   │   ├── builder.ts    # Super Agent 构建器
│   │   ├── executor.ts   # 协作执行器（串行/并行/编排模式）
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
│   │   ├── session.ts    # 会话管理（内存 + 文件持久化）
│   │   ├── handlers.ts   # 路由处理器（REST API 端点）
│   │   ├── handler-utils.ts # 辅助函数（事件队列、Agent 加载、版本读取）
│   │   ├── server.ts     # HTTP 服务器，集成 WebSocket
│   │   ├── ws-server.ts  # WebSocket 服务端（频道订阅、心跳、认证）
│   │   ├── ws-body-push.ts # 身体图式定时推送
│   │   ├── ws-types.ts   # WebSocket 消息类型定义
│   │   ├── safe-tools.ts # 工具安全过滤
│   │   └── index.ts      # 公共导出
│   ├── logger/           # 日志系统
│   │   ├── types.ts      # 类型定义（LogLevel, Logger 接口）
│   │   └── logger.ts     # 文件日志实现（JSONL 格式）
│   ├── http/             # HTTP 客户端（统一代理支持）
│   ├── search/           # 搜索引擎 Provider（Bing, Brave）
│   ├── tui/              # TUI 终端交互界面
│   │   ├── index.ts      # 入口，命令行参数解析
│   │   ├── client.ts     # HTTP/SSE 客户端
│   │   ├── chat.ts       # 交互式聊天循环
│   │   └── format.ts     # ANSI 终端格式化
│   ├── errors/           # 错误体系
│   ├── workspace/        # workspace 初始化
│   ├── main.ts           # 应用启动入口（npm run dev / npm start）
│   └── index.ts          # 库导出入口
├── tests/                # 单元测试（与 src/ 目录结构对应）
├── web/                  # Web UI 客户端（React + Vite）
│   ├── src/
│   │   ├── components/   # UI 组件（Header, Sidebar, ChatView, ExecutionTreeView）
│   │   ├── pages/        # 页面（AgentsPage, MonitorPage）
│   │   ├── hooks/        # React Hooks（useChat, useExecutionTree, useBodySchema）
│   │   ├── services/     # API 客户端（REST + WebSocket）
│   │   └── styles/       # 主题与全局样式
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── config.example.json   # 配置模板
├── CLAUDE.md             # 开发规则
└── ROADMAP.md            # 开发计划（不入版本控制）
```

## Workspace 运行时结构

```
workspace/
├── prompts/          # 用户级别提示词（扁平 .md 文件）
│   ├── self.md       # 自我图式
│   ├── tool.md       # 工具注册表
│   ├── skill.md      # 技能注册表
│   ├── agent.md      # Agent 注册表
│   ├── memory.md     # 长期记忆
│   └── memory/       # 短期记忆（按日期 yyyy-MM-dd.md）
├── tools/            # 自定义工具（registry.json + 脚本）
├── skills/           # 自定义技能（registry.json）
├── solutions/        # Solution 注册表
├── agents/           # Agent 实例及其独立工作空间
├── super-agents/     # Super Agent 协作实例
├── state/            # 状态持久化（快照+完整性校验）
├── sessions/         # 会话持久化数据
├── logs/             # 日志（按日期分隔，JSONL 格式）
├── qmd/              # 向量索引缓存
└── tmp/              # 临时文件（任务完成后清理）
```

---

## 模块职责

### 1. 配置系统 (`src/config/`)

| 文件 | 职责 |
|------|------|
| `schema.ts` | Zod schema 定义全部配置项结构（模型、API、工具、ReAct、记忆、持久化等） |
| `loader.ts` | 从 `config.json` 加载配置，支持 `${ENV_VAR}` 环境变量替换 |

**依赖**: 无（底层模块）

### 2. 模型抽象层 (`src/model/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | ModelRequest/ModelResponse/StreamEvent 等核心类型 |
| `providers/adapter.ts` | 将 Ouroboros 接口映射到 pi-ai 库 |
| `registry.ts` | 提供商注册表，懒初始化 + 缓存 |
| `retry.ts` | 指数退避重试逻辑 |
| `call-model.ts` | 统一 callModel 函数（含超时、重试、think 注入） |

**依赖**: `config` → `model`
**外部依赖**: `@mariozechner/pi-ai`

### 3. 提示词系统 (`src/prompt/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | PromptFileType、PromptMetadata、RenderedPrompt、AssembledPrompt 等类型 |
| `template.ts` | `{{variable}}` 模板变量替换引擎 |
| `store.ts` | 扁平 .md + YAML frontmatter 读写，提示词文件 CRUD |
| `loader.ts` | 加载提示词文件、关键词搜索、语义搜索 |
| `assembler.ts` | 按优先级拼装提示词（core → self → agent → skill → tool → memory） |
| `vector.ts` | qmd 向量索引管理，语义搜索支持 |
| `template/` | 提示词模板文件（core.md、self.md 等） |

**依赖**: `config` → `prompt`
**外部依赖**: `@tobilu/qmd`

#### 提示词文件体系

| 文件 | 位置 | 说明 | qmd 索引 |
|------|------|------|----------|
| `core.md` | `src/prompt/template/` | 系统提示词（安全边界、ReAct 核心、内置工具/技能/解决方案），直接引用不复制 | 否 |
| `self.md` | `workspace/prompts/` | 自我图式（身体图式+灵魂图式+激素），含 {{variable}} 变量，运行时更新 | 否 |
| `tool.md` | `workspace/prompts/` | 自定义工具注册表，动态累加，无变量 | 是 |
| `skill.md` | `workspace/prompts/` | 自定义技能注册表，动态累加，无变量 | 是 |
| `agent.md` | `workspace/prompts/` | 自定义 Agent 注册表，量小直接加载，无变量 | 否 |
| `memory.md` | `workspace/prompts/` | 长期记忆（压缩摘要），动态累加，无变量 | 是 |
| `memory/*.md` | `workspace/prompts/memory/` | 短期记忆（按日期文件），详细交互，无变量 | 是 |

> 内置工具、技能、解决方案的描述在 `core.md` 中，不暴露给用户修改。`tool.md`、`skill.md`、`agent.md` 仅记录用户自定义的内容。

#### qmd 向量索引

- `@tobilu/qmd` 作为项目依赖，通过 `npx qmd` 调用
- 索引存储在 `workspace/vectors/` 下（通过 `XDG_CACHE_HOME` 环境隔离）
- 只索引 tool.md、skill.md、memory.md 和 memory/ 目录
- `initVectorIndex` 幂等，不重复创建已有 collection
- `collection add` 后需显式 `embed`

### 4. 工具层 (`src/tool/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | EntityCard、OuroborosTool、ToolCallRequest/Response、ToolHandler |
| `schema.ts` | Zod 校验各工具 inputSchema |
| `registry.ts` | 工具注册表（内存 Map + 持久化 + qmd 索引） |
| `executor.ts` | 工具执行器（builtin/scripts 路由、超时控制） |
| `converter.ts` | OuroborosTool → 模型层 ToolDefinition 转换 |
| `builtin/` | 内置工具实现 |

**依赖**: `model` → `tool`

#### 一级工具（系统原语）

| 工具 ID | 名称 | 说明 |
|---------|------|------|
| `tool:call-model` | 模型调用 | 调用大语言模型进行推理和生成 |
| `tool:run-agent` | Agent 调用 | 调用指定 Agent 执行任务 |
| `tool:search-tool` | 工具检索 | qmd 语义搜索 + 关键词匹配工具库 |
| `tool:create-tool` | 工具创建 | 动态创建 .js 工具脚本并注册 |

#### 二级工具

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

#### 工具调用协议

所有工具通过统一的 `ToolCallRequest` / `ToolCallResponse` 协议调用：

```typescript
const response = await executor.execute({
  requestId: "req-001",
  toolId: "tool:call-model",
  input: { messages: [{ role: "user", content: "你好" }] },
  caller: { entityId: "agent:core" },
});
```

#### 自定义工具

通过 `tool:create-tool` 动态创建工具：
- 生成 `.js` ES Module 脚本（`export default async function(input, context) { ... }`）
- 动态 import 校验导出格式
- SHA-256 代码签名存入 metadata
- 自动注册到 `workspace/tools/registry.json` 和 `prompts/tool.md`

### 5. 技能层 (`src/skill/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | SkillDefinition、SkillStep、SkillContext 等类型 |
| `registry.ts` | 技能注册表（内存 + 持久化） |
| `executor.ts` | 技能执行器（步骤编排、变量传递） |
| `builtin/definitions.ts` | 内置技能定义 |

**依赖**: `tool` → `skill`

Skill 是工具编排的逻辑封装，包含提示词模板和可选辅助脚本。

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
```

### 6. 解决方案层 (`src/solution/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | SolutionDefinition、SolutionConfig、SolutionContext |
| `registry.ts` | Solution 注册表 |
| `executor.ts` | Solution 执行器（独立 ReAct 循环 + workspace） |
| `builder.ts` | Solution 构建器（配置 → 实例） |
| `knowledge.ts` | 知识库管理 |

**依赖**: `skill` → `solution`

Agent 是以特定身份提供服务的智能体，包含身份定义、知识库、技能组。

```typescript
import { createSolutionRegistry, buildAgent, createAgentExecutor } from "ouroboros";

const registry = await createSolutionRegistry(workspacePath);
await registry.register({
  id: "solution:code-reviewer",
  identityPrompt: "你是一位代码审查专家",
  skills: ["skill:read-file"],
  interaction: { multiTurn: true, humanInLoop: false, inputModes: ["text"], outputModes: ["text"] },
});

const agent = await buildAgent(definition, workspacePath);
const executor = createAgentExecutor(deps);
const response = await executor.execute({
  agentId: "solution:code-reviewer",
  task: "审查 src/index.ts 的代码质量",
});
```

### 7. 超级智能体层 (`src/super-agent/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | SuperAgentDefinition、AgentRole、Coordination 策略 |
| `registry.ts` | Super Agent 注册表 |
| `executor.ts` | 多 Agent 协调执行器 |
| `builder.ts` | Super Agent 构建器 |

**依赖**: `solution` → `super-agent`

协作模式：

| 模式 | 说明 |
|------|------|
| **sequential** | 按依赖拓扑排序串行执行，前置 Agent 输出作为后续输入 |
| **parallel** | 无依赖 Agent 并行执行（按层级分组），有依赖的等待 |
| **orchestrated** | 由指定编排 Agent 动态分配任务和调度执行 |

```typescript
import { createSuperAgentRegistry, buildSuperAgent, createSuperAgentExecutor } from "ouroboros";

const registry = await createSuperAgentRegistry(workspacePath);
await registry.register({
  id: "super-agent:blog-writer",
  responsibilityPrompt: "负责博客文章制作的协作",
  agents: [
    { roleName: "researcher", responsibility: "调研信息", agentId: "solution:researcher" },
    { roleName: "writer", responsibility: "撰写内容", agentId: "solution:writer", dependsOn: ["researcher"] },
    { roleName: "reviewer", responsibility: "审查内容", agentId: "solution:reviewer", dependsOn: ["writer"] },
  ],
  collaboration: { mode: "sequential" },
});

const executor = createSuperAgentExecutor(deps);
const response = await executor.execute({
  superAgentId: "super-agent:blog-writer",
  task: "写一篇关于人工智能的博客",
});
```

### 8. ReAct 核心循环 (`src/core/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | TaskState、ExecutionNode/Tree、ReactStep/Result、ReactLoopConfig |
| `loop.ts` | runReactLoop — Thought → Action → Observation 主循环 |
| `execution-tree.ts` | 纯函数不可变执行树操作（create/add/complete/fail/toJSON/fromJSON） |
| `exception.ts` | 异常处理（回滚、终止、循环检测、审查程序接入） |
| `context-compression.ts` | 上下文窗口压缩（模型摘要 + 截断兜底） |

**依赖**: `model` + `tool` + `prompt` → `core`

特性：
- **执行树管理**：不可变纯函数操作，跟踪任务分解和执行状态
- **并行工具调用**：模型返回多个工具调用时通过 `Promise.all` 并行执行
- **上下文压缩**：消息历史超过阈值时自动摘要压缩，保留关键信息
- **死循环检测**：连续 3 次相同工具+相同参数调用触发异常报告

```typescript
import { runReactLoop } from "ouroboros";

const result = await runReactLoop(
  "查询今天的日期并写入文件",
  systemPrompt,
  tools,
  { maxIterations: 20, stepTimeout: 60000, parallelToolCalls: true, compressionThreshold: 10, agentId: "agent:core" },
  { callModel, toolExecutor, toolRegistry, logger, workspacePath },
);

console.log(result.answer);        // 最终回答
console.log(result.steps);         // 每个步骤的工具调用
console.log(result.executionTree); // 执行树
```

### 9. 自我图式 (`src/schema/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | BodySchema、SoulSchema、HormoneState、SelfSchemaVariables |
| `body.ts` | 身体图式采集（CPU、内存、磁盘、GPU、Node 版本） |
| `soul.ts` | 灵魂图式（世界模型 + 自我认知，格式化为提示词） |
| `hormone.ts` | 激素系统（focusLevel、cautionLevel、creativityLevel） |
| `schema-provider.ts` | 统一提供者，组合 body/soul/hormone 输出模板变量 |

**依赖**: 无（底层模块）

```typescript
import { createSchemaProvider } from "ouroboros";

const provider = createSchemaProvider(workspacePath, {
  hormoneDefaults: { focusLevel: 70, cautionLevel: 40, creativityLevel: 60 },
});

const vars = provider.getVariables();
// { platform, availableMemory, gpu, workspacePath, currentDateTime, worldModel, selfAwareness, ... }

const hormones = provider.getHormoneManager();
hormones.adjustCaution(10); // 检测到风险时增加谨慎度
```

### 10. 记忆管理 (`src/memory/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | MemoryEntry、MemoryManager、ShortTermMemory、LongTermMemory |
| `short-term.ts` | 短期记忆（按日期 .md 文件 + qmd 向量化） |
| `long-term.ts` | 长期记忆（持久化知识库） |
| `session.ts` | 会话记忆（单次会话上下文） |
| `manager.ts` | 统一记忆管理器 |

**依赖**: `prompt` → `memory`

| 层级 | 存储 | 生命周期 | 说明 |
|------|------|----------|------|
| **Hot Memory** | 内存 | 每次 callModel 注入 | 实时记忆，token 限制自动淘汰旧条目 |
| **Cold Memory** | tmp/memory/ | 任务结束清理 | 步骤级缓存，按需加载 |
| **短期记忆** | prompts/memory/*.md | 持久（按日期） | 完整交互记录，按日期分文件 |
| **长期记忆** | prompts/memory.md | 持久（累积） | 压缩摘要：知识、行为模式、决策 |

```typescript
import { createMemoryManager } from "ouroboros";

const memoryManager = createMemoryManager(workspacePath, {
  shortTerm: true, longTerm: true, hotSessionMaxTokens: 4000,
});

memoryManager.hot.add({ timestamp: "...", type: "conversation", content: "..." });
await memoryManager.shortTerm.append({ timestamp: "...", type: "tool-call", content: "..." });
await memoryManager.longTerm.appendKnowledge("项目采用分层架构");
```

### 11. 审查程序 (`src/inspector/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | InspectorAction（approve/modify/reject/terminate）、InspectorConfig |
| `inspector.ts` | 工具调用前审查、安全策略、自动/手动模式 |
| `rules.ts` | 审查规则定义 |

**依赖**: `tool` → `inspector`

### 12. 反思器 (`src/reflection/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | ReflectionResult、Reflector 接口 |
| `reflector.ts` | 任务完成后反思，提取经验存入长期记忆 |

**依赖**: `model` + `memory` → `reflection`

```typescript
import { createInspector, createReflector } from "ouroboros";

// 审查程序 — 定时检查执行树，检测死循环、超时、资源耗尽等异常
const inspector = createInspector(logger);
const result = inspector.inspect({ tree, bodySchema, startTime, config });

// 反思程序 — 任务完成后分析执行过程，更新长期记忆
const reflector = createReflector({ callModel, longTermMemory, logger });
const output = await reflector.reflect({ taskDescription, steps, result });
```

### 13. 持久化 (`src/persistence/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | Snapshot、PersistenceConfig |
| `snapshot.ts` | 快照读写（JSON 序列化到文件） |
| `integrity.ts` | 数据完整性校验（SHA-256 校验和） |
| `recovery.ts` | 从快照恢复状态 |
| `shutdown.ts` | 优雅关闭时保存快照 |
| `manager.ts` | 统一持久化管理器 |

**依赖**: `config` → `persistence`

特性：状态快照、原子写入（.tmp → rename）、SHA-256 完整性校验、自动恢复、优雅关闭、过期清理。

### 14. API / 通信层 (`src/api/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | ApiDeps、SendMessageRequest、SSEEvent、SessionInfo、ChatMessage |
| `router.ts` | 轻量路由器（路径参数匹配） |
| `middleware.ts` | CORS、认证、速率限制中间件 |
| `handlers.ts` | 所有 REST 路由处理器 |
| `handler-utils.ts` | 辅助函数（事件队列、Agent 加载、版本读取） |
| `session.ts` | 会话管理器（内存 + 文件持久化、防抖写盘） |
| `server.ts` | HTTP 服务器创建与启动，集成 WebSocket |
| `ws-server.ts` | WebSocket 服务端（频道订阅、心跳、认证） |
| `ws-body-push.ts` | 身体图式定时 WebSocket 推送 |
| `ws-types.ts` | WebSocket 消息类型定义 |
| `formatter.ts` | Agent 响应格式化 |
| `response.ts` | 统一响应构造器 |
| `safe-tools.ts` | 工具安全过滤 |

**依赖**: 几乎所有模块 → `api`（最顶层聚合）

#### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/sessions` | 创建会话 |
| GET | `/api/sessions` | 列出会话 |
| GET | `/api/sessions/:id` | 获取会话详情 |
| POST | `/api/sessions/:id/delete` | 删除会话 |
| GET | `/api/sessions/:id/usage` | 获取会话 Token 用量 |
| POST | `/api/chat/message` | 发送消息（支持 `stream: true` 流式） |
| GET | `/api/chat/messages/:sessionId` | 获取消息历史（分页） |
| GET | `/api/sessions/:id/execution-tree` | 获取执行树快照 |
| GET | `/api/sessions/:id/execution-tree/stream` | 执行树 SSE 实时更新 |
| GET | `/api/agents` | 列出 Agent |
| GET | `/api/agents/:agentId` | 获取 Agent 详情 |
| GET | `/api/self-schema` | 获取自我图式 |
| GET | `/api/skills` | 列出技能 |
| GET | `/api/tools` | 列出工具 |

#### 使用示例

```typescript
import { createApiServer } from "ouroboros";

const server = createApiServer({
  logger,
  workspacePath: "./workspace",
  config: {
    port: 3000,
    host: "127.0.0.1",
    apiKey: "my-secret-key",
    rateLimit: { windowMs: 60000, maxRequests: 60 },
    corsOrigin: "*",
  },
});

await server.start();
```

### 15. TUI 终端界面 (`src/tui/`)

| 文件 | 职责 |
|------|------|
| `index.ts` | 入口，命令行参数解析 |
| `client.ts` | HTTP/SSE 客户端，连接后端 API |
| `chat.ts` | 交互式聊天循环，命令处理 |
| `format.ts` | ANSI 终端格式化工具 |

**依赖**: 无（独立进程，通过 HTTP 连接后端）

```bash
npm run tui                          # 默认连接 127.0.0.1:3000
npm run tui -- --host 10.0.0.1 -p 8080 -k my-key  # 自定义参数
```

内置命令：`/help` `/new` `/sessions` `/switch <id>` `/history` `/health` `/clear` `/exit`

### 16. Web UI 客户端 (`web/`)

基于 React + Vite + TypeScript 的 Web 界面。

- **Chat 对话界面**：SSE 流式输出、Markdown 渲染（react-markdown）、代码高亮（highlight.js）、Token 用量展示
- **Agent 管理面板**：查看 Agent 列表、状态、技能信息
- **系统监控**：Self Schema（身体/灵魂/激素，WebSocket 实时推送）、Skills、Tools 三个 Tab
- **会话管理**：侧边栏会话列表，创建/切换/删除会话、历史回显（含执行树和 ReAct 过程）
- **响应式设计**：支持桌面和移动端

```bash
cd web && npm install && npm run dev   # 开发模式，访问 http://localhost:5173
cd web && npm run build                # 生产构建，产出 web/dist/
```

E2E 测试覆盖 6 个关键用户流程（Playwright）。

### 17. 其他基础模块

| 模块 | 职责 |
|------|------|
| `errors/` | OuroborosError 基类及子类（ToolError、ReactError 等） |
| `logger/` | JSONL 日志系统，异步写入 workspace/logs/，按日期分隔 |
| `http/` | HTTP 客户端封装（undici ProxyAgent 代理支持） |
| `search/` | 搜索引擎适配（Bing HTML 抓取、Brave API） |
| `workspace/` | Workspace 初始化（目录创建、模板复制） |

---

## 依赖关系图

```
config ─────┬──→ model ──────┬──→ core (ReAct 循环)
            │                │        ↑
            ├──→ prompt ─────┤        │
            │                │    tool ┘
            ├──→ persistence │      ↑
            │                │    skill
schema ─────┘                │      ↑
                             │   solution
logger ──────────────────────┘      ↑
                                 super-agent
memory ←── prompt
inspector ←── tool
reflection ←── model + memory

api ←── 所有模块（顶层聚合）
tui ←── api（HTTP 客户端，独立进程）
web ←── api（HTTP + WebSocket，独立前端）
```

## 四层实体架构

遵循 `PROTOCOL.md` 定义的标准协议：

### Tool（一级）
最小执行单元。每个 Tool 有 EntityCard 元数据 + ToolDefinition（inputSchema）。
- 内置：call-model、run-agent、search-tool、create-tool、bash、read、write、edit 等
- 自定义：ES Module 脚本，SHA-256 代码签名

### Skill（二级）
多步骤编排。一个 Skill 由有序 SkillStep 组成，每步调用 Tool 并传递变量。
- 支持条件分支和循环
- 内置：create-solution、search-skill、create-skill

### Solution / Agent（三级）
具备独立 ReAct 循环的完整 Agent。拥有独立 workspace、工具集、提示词。
- 默认 Agent: `agent:main`
- 可通过 Skill 动态创建

### Super Agent（四级）
多 Agent 协作。协调多个 Solution 完成复杂任务。
- 支持角色分配和协调策略（串行 / 并行 / 编排）

## 数据流

### 消息处理流程

```
用户消息
  ↓
API 层 (handlers.ts)
  ↓
会话管理 (session.ts) — 记录消息
  ↓
提示词装配 (assembler.ts) — core + self + memory + tool
  ↓
ReAct 循环 (loop.ts)
  ├── 模型推理 (call-model)
  ├── 工具执行 (executor.ts)
  ├── 执行树更新 (execution-tree.ts)
  ├── 审查检查 (inspector)
  └── 上下文压缩 (context-compression.ts)
  ↓
响应格式化 (formatter.ts)
  ↓
SSE 流式输出 / JSON 响应 / WebSocket 推送
  ↓
客户端（Web UI / TUI / API 调用方）
```

### 实时推送流程

```
SchemaProvider.refresh() — 每 5s
  ↓
ws-body-push.ts — 广播到 body_schema 频道
  ↓
WebSocket 服务端 (ws-server.ts)
  ↓
已订阅客户端（Web UI useBodySchema hook）
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 语言 | TypeScript 5.9+, ES Modules |
| 运行时 | Node.js >= 20 |
| 模型层 | @mariozechner/pi-ai（多模型 API 统一） |
| 校验 | Zod 4.x |
| 测试 | Vitest 4.x |
| 向量搜索 | @tobilu/qmd |
| WebSocket | ws |
| Web 前端 | React + Vite + TypeScript |
| HTTP 客户端 | undici |
