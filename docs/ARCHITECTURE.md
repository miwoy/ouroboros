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
├── src/                      # 后端源码
│   ├── main.ts               # 应用启动入口
│   ├── index.ts              # 包导出入口
│   ├── api/                  # API / 通信层
│   ├── config/               # 配置系统
│   ├── core/                 # ReAct 核心循环
│   ├── errors/               # 统一错误体系
│   ├── http/                 # HTTP 客户端（代理支持）
│   ├── inspector/            # 审查程序
│   ├── integration/          # 阶段集成测试脚本
│   ├── logger/               # 日志系统
│   ├── memory/               # 记忆管理（短期/长期/会话）
│   ├── model/                # 模型抽象层
│   ├── persistence/          # 状态持久化与恢复
│   ├── prompt/               # 提示词系统
│   ├── reflection/           # 反思器
│   ├── schema/               # 自我图式（身体/灵魂/激素）
│   ├── search/               # 搜索引擎适配
│   ├── skill/                # 技能层（二级实体）
│   ├── solution/             # 解决方案层（三级实体 / Agent）
│   ├── super-agent/          # 超级智能体层（四级实体）
│   ├── tool/                 # 工具层（一级实体）
│   ├── tui/                  # 终端交互界面
│   └── workspace/            # Workspace 初始化
├── tests/                    # 单元测试（与 src/ 目录结构对应）
├── web/                      # Web UI 前端（React + Vite）
├── docs/                     # 文档
│   ├── DESIGN.md             # 系统设计文档
│   ├── CONFIGURE.md          # 配置项说明
│   ├── PROTOCOL.md           # 标准协议（实体接口规范）
│   └── ARCHITECTURE.md       # 本文档
├── config.example.json       # 配置示例
├── CLAUDE.md                 # 开发规则
└── ROADMAP.md                # 开发计划（不入 git）
```

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

### 4. 工具层 (`src/tool/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | EntityCard、OuroborosTool、ToolCallRequest/Response、ToolHandler |
| `schema.ts` | Zod 校验各工具 inputSchema |
| `registry.ts` | 工具注册表（内存 Map + 持久化 + qmd 索引） |
| `executor.ts` | 工具执行器（builtin/scripts 路由、超时控制） |
| `converter.ts` | OuroborosTool → 模型层 ToolDefinition 转换 |
| `builtin/` | 内置工具实现（14 个：bash、read、write、edit、find、call-model、run-agent、search-tool、create-tool、web-search、web-fetch、search-skill、create-skill） |

**依赖**: `model` → `tool`

### 5. 技能层 (`src/skill/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | SkillDefinition、SkillStep、SkillContext 等类型 |
| `registry.ts` | 技能注册表（内存 + 持久化） |
| `executor.ts` | 技能执行器（步骤编排、变量传递） |
| `builtin/definitions.ts` | 内置技能定义 |

**依赖**: `tool` → `skill`

### 6. 解决方案层 (`src/solution/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | SolutionDefinition、SolutionConfig、SolutionContext |
| `registry.ts` | Solution 注册表 |
| `executor.ts` | Solution 执行器（独立 ReAct 循环 + workspace） |
| `builder.ts` | Solution 构建器（配置 → 实例） |
| `knowledge.ts` | 知识库管理 |

**依赖**: `skill` → `solution`

### 7. 超级智能体层 (`src/super-agent/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | SuperAgentDefinition、AgentRole、Coordination 策略 |
| `registry.ts` | Super Agent 注册表 |
| `executor.ts` | 多 Agent 协调执行器 |
| `builder.ts` | Super Agent 构建器 |

**依赖**: `solution` → `super-agent`

### 8. ReAct 核心循环 (`src/core/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | TaskState、ExecutionNode/Tree、ReactStep/Result、ReactLoopConfig |
| `loop.ts` | runReactLoop — Thought → Action → Observation 主循环 |
| `execution-tree.ts` | 纯函数不可变执行树操作（create/add/complete/fail/toJSON/fromJSON） |
| `exception.ts` | 异常处理（回滚、终止、循环检测、审查程序接入） |
| `context-compression.ts` | 上下文窗口压缩（模型摘要 + 截断兜底） |

**依赖**: `model` + `tool` + `prompt` → `core`

### 9. 自我图式 (`src/schema/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | BodySchema、SoulSchema、HormoneState、SelfSchemaVariables |
| `body.ts` | 身体图式采集（CPU、内存、磁盘、GPU、Node 版本） |
| `soul.ts` | 灵魂图式（世界模型 + 自我认知，格式化为提示词） |
| `hormone.ts` | 激素系统（focusLevel、cautionLevel、creativityLevel） |
| `schema-provider.ts` | 统一提供者，组合 body/soul/hormone 输出模板变量 |

**依赖**: 无（底层模块）

### 10. 记忆管理 (`src/memory/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | MemoryEntry、MemoryManager、ShortTermMemory、LongTermMemory |
| `short-term.ts` | 短期记忆（按日期 .md 文件 + qmd 向量化） |
| `long-term.ts` | 长期记忆（持久化知识库） |
| `session.ts` | 会话记忆（单次会话上下文） |
| `manager.ts` | 统一记忆管理器 |

**依赖**: `prompt` → `memory`

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

### 13. 持久化 (`src/persistence/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | Snapshot、PersistenceConfig |
| `snapshot.ts` | 快照读写（JSON 序列化到文件） |
| `integrity.ts` | 数据完整性校验 |
| `recovery.ts` | 从快照恢复状态 |
| `shutdown.ts` | 优雅关闭时保存快照 |
| `manager.ts` | 统一持久化管理器 |

**依赖**: `config` → `persistence`

### 14. API / 通信层 (`src/api/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | ApiDeps、SendMessageRequest、SSEEvent、SessionInfo、ChatMessage |
| `router.ts` | 轻量路由器（路径参数匹配） |
| `middleware.ts` | CORS、认证、速率限制中间件 |
| `handlers.ts` | 所有 REST 路由处理器（会话、消息、Agent、工具、技能等） |
| `handler-utils.ts` | 辅助函数（事件队列、Agent 加载、版本读取） |
| `session.ts` | 会话管理器（内存 + 文件持久化、防抖写盘） |
| `server.ts` | HTTP 服务器创建与启动，集成 WebSocket |
| `ws-server.ts` | WebSocket 服务端（频道订阅、心跳、认证） |
| `ws-body-push.ts` | 身体图式定时 WebSocket 推送 |
| `ws-types.ts` | WebSocket 消息类型定义 |
| `formatter.ts` | Agent 响应格式化 |
| `response.ts` | 统一响应构造器 |
| `safe-tools.ts` | 工具安全过滤（自动认证的工具白名单） |

**依赖**: 几乎所有模块 → `api`（最顶层聚合）

### 15. TUI 终端界面 (`src/tui/`)

| 文件 | 职责 |
|------|------|
| `index.ts` | 入口，命令行参数解析 |
| `client.ts` | HTTP/SSE 客户端，连接后端 API |
| `chat.ts` | 交互式聊天循环，命令处理 |
| `format.ts` | ANSI 终端格式化工具 |

**依赖**: 无（独立进程，通过 HTTP 连接后端）

### 16. 其他基础模块

| 模块 | 职责 |
|------|------|
| `errors/` | OuroborosError 基类及子类（ToolError、ReactError 等） |
| `logger/` | JSONL 日志系统，异步写入 workspace/logs/ |
| `http/` | HTTP 客户端封装（代理支持） |
| `search/` | 搜索引擎适配（Bing、Brave） |
| `workspace/` | Workspace 初始化（目录创建、模板复制） |

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

遵循 `docs/PROTOCOL.md` 定义的标准协议：

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
- 支持角色分配和协调策略

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
SSE 流式输出 / JSON 响应
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

## Workspace 结构

运行时在 `config.system.workspacePath` 下生成：

```
workspace/
├── prompts/          # 用户级提示词文件（.md + YAML frontmatter）
├── tools/            # 自定义工具（registry.json + 脚本）
├── skills/           # 自定义技能（registry.json）
├── solutions/        # Agent 实例（registry.json + 各 Agent workspace）
├── super-agents/     # Super Agent 实例
├── memory/           # 记忆数据
├── logs/             # 日志（yyyy-MM-dd.log，JSONL）
├── sessions/         # 会话持久化数据
├── snapshots/        # 状态快照
├── qmd/              # 向量索引缓存
└── tmp/              # 临时文件（任务完成后清理）
```
