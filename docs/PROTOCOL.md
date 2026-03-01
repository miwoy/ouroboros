# **Ouroboros 标准协议（PROTOCOL）**

本文档定义 Ouroboros 系统中 Tool、Skill、Solution（Agent）、Super Agent 四个层级的统一接口规范。所有动态创建、注册、发现、调用的实体都必须遵守此协议。

设计参考了业界两个主流开放标准：MCP（Model Context Protocol）定义了模型与工具之间的连接规范，A2A（Agent2Agent Protocol）定义了智能体之间的通信与协作规范。Ouroboros 协议在此基础上进行内化适配，形成系统内部的自相似协议栈。

---

## **一、核心原则**

1. **自相似**：四个层级共享相同的元数据结构基座（EntityCard），高层级是低层级的组合与扩展，不引入异构概念。
2. **最小充分**：每个层级只定义该层级必须新增的字段，继承而非重复基座字段。
3. **可发现**：所有实体注册后可通过向量检索（qmd）按名称、描述、标签语义匹配。
4. **生命周期统一**：所有实体共享同一套状态机（created → active → deprecated → archived）。
5. **安全边界明确**：每个实体声明自己的权限需求，运行时由系统校验授权。

---

## **二、基座：EntityCard**

所有层级实体的公共元数据结构。借鉴 A2A 的 Agent Card 和 MCP 的 Tool Definition，统一为 EntityCard。

```
/** 实体类型枚举 */
enum EntityType {
  Tool = 'tool',
  Skill = 'skill',
  Solution = 'solution',       // 即 Agent
  SuperAgent = 'super-agent',
}

/** 实体生命周期状态 */
enum EntityStatus {
  Created = 'created',       // 已创建，未激活
  Active = 'active',         // 可用
  Deprecated = 'deprecated', // 已弃用，仍可调用但会发出警告
  Archived = 'archived',     // 已归档，不可调用
}

/** 权限声明 */
interface Permissions {
  /** 允许的文件系统访问路径（glob 模式） */
  filesystem?: string[];
  /** 是否允许网络访问 */
  network?: boolean;
  /** 是否允许执行系统命令 */
  shellExec?: boolean;
  /** 是否允许调用模型 */
  modelAccess?: boolean;
  /** 是否允许创建子实体（Tool/Skill/Agent） */
  createEntity?: boolean;
  /** 自定义权限键值对 */
  custom?: Record<string, boolean>;
}

/** 实体基座卡片——所有层级共享 */
interface EntityCard {
  /** 唯一标识符，格式: {type}:{kebab-case-name}，如 tool:web-search */
  id: string;
  /** 实体类型 */
  type: EntityType;
  /** 人类可读名称 */
  name: string;
  /** 功能描述，同时作为向量检索的语义文本 */
  description: string;
  /** 语义标签，辅助检索 */
  tags?: string[];
  /** 语义化版本号 */
  version: string;
  /** 当前状态 */
  status: EntityStatus;
  /** 权限声明 */
  permissions: Permissions;
  /** 创建来源：system（系统内置）| user（用户创建）| generated（系统自动生成） */
  origin: 'system' | 'user' | 'generated';
  /** 创建时间 ISO 8601 */
  createdAt: string;
  /** 最后更新时间 ISO 8601 */
  updatedAt: string;
  /** 扩展元数据 */
  metadata?: Record<string, unknown>;
}
```

### **注册与发现**

所有实体创建后必须完成两步注册：

1. **文件注册**：将完整定义文件（JSON）写入对应 workspace 目录
2. **索引注册**：将 `id`、`name`、`description`、`tags` 写入 qmd 向量库，供语义检索

检索接口统一为：

```
interface SearchRequest {
  /** 自然语言查询 */
  query: string;
  /** 限定实体类型 */
  type?: EntityType | EntityType[];
  /** 返回数量上限，默认 5 */
  limit?: number;
  /** 最低相似度阈值 0-1，默认 0.6 */
  threshold?: number;
}

interface SearchResult {
  /** 匹配到的实体卡片 */
  card: EntityCard;
  /** 相似度得分 */
  score: number;
}
```

---

## **三、Tool 层协议**

Tool 是最小的可执行单元，对应 MCP 中的 Tool Definition。

```
/** 工具定义 */
interface ToolDefinition extends EntityCard {
  type: EntityType.Tool;

  /** 输入参数 JSON Schema */
  inputSchema: JSONSchema;

  /** 输出结果 JSON Schema */
  outputSchema: JSONSchema;

  /**
   * 工具执行入口
   * - 内置工具：指向系统内部函数路径，如 "builtin:base"
   * - 自定义工具：指向脚本文件的相对路径，如 "scripts/my-tool.ts"
   */
  entrypoint: string;

  /** 执行超时时间（毫秒），默认 30000 */
  timeout?: number;

  /** 是否支持异步执行 */
  async?: boolean;

  /** 重试策略 */
  retry?: {
    /** 最大重试次数，默认 0 */
    maxRetries: number;
    /** 重试间隔（毫秒），默认 1000 */
    delay: number;
  };
}
```

### **一级工具（内置）**

一级工具是系统原语，不可被删除或覆盖：

| **id** | **描述** | **inputSchema 核心字段** |
| --- | --- | --- |
| `tool:call-model` | 模型调用 | `{ prompt, systemPrompt?, model?, temperature? }` |
| `tool:run-agent` | Agent 调用 | `{ agentId, task, context? }` |
| `tool:search-tool` | 工具检索 | `{ query, limit? }` |
| `tool:create-tool` | 工具创建 | `{ definition: ToolDefinition, code: string }` |

### **工具调用协议**

统一的调用请求与响应格式：

```
/** 工具调用请求 */
interface ToolCallRequest {
  /** 请求唯一 ID */
  requestId: string;
  /** 目标工具 ID */
  toolId: string;
  /** 输入参数，必须符合工具的 inputSchema */
  input: Record<string, unknown>;
  /** 调用来源（用于审计追踪） */
  caller: {
    /** 发起调用的实体 ID */
    entityId: string;
    /** 所属执行树节点 ID */
    nodeId?: string;
  };
}

/** 工具调用响应 */
interface ToolCallResponse {
  /** 对应的请求 ID */
  requestId: string;
  /** 执行是否成功 */
  success: boolean;
  /** 输出结果，符合工具的 outputSchema */
  output?: Record<string, unknown>;
  /** 错误信息（success 为 false 时） */
  error?: {
    code: ToolErrorCode;
    message: string;
    /** 是否可重试 */
    retryable: boolean;
  };
  /** 执行耗时（毫秒） */
  duration: number;
}

/** 工具错误码 */
enum ToolErrorCode {
  /** 输入参数不合法 */
  InvalidInput = 'INVALID_INPUT',
  /** 执行超时 */
  Timeout = 'TIMEOUT',
  /** 权限不足 */
  PermissionDenied = 'PERMISSION_DENIED',
  /** 运行时错误 */
  RuntimeError = 'RUNTIME_ERROR',
  /** 工具不存在 */
  NotFound = 'NOT_FOUND',
  /** 资源耗尽 */
  ResourceExhausted = 'RESOURCE_EXHAUSTED',
}
```

### **createTool 安全约束**

通过 `tool:create-tool` 动态创建的工具必须遵守以下安全规则：

1. **沙箱执行**：生成的代码在受限的沙箱环境中运行，不继承父进程权限
2. **权限白名单**：创建者必须在 `permissions` 中显式声明所需权限，系统只授予声明的权限且不超过创建者自身的权限（权限不可提升）
3. **审查验证**：新工具在首次调用前需经审查程序验证，验证通过后 status 才从 `created` 变为 `active`
4. **代码签名**：生成的工具代码计算 SHA-256 哈希存入 metadata，运行时校验防止篡改

---

## **四、Skill 层协议**

Skill 是工具编排的逻辑封装，包含提示词模板和可选的辅助脚本。

```
/** 技能定义 */
interface SkillDefinition extends EntityCard {
  type: EntityType.Skill;

  /** 任务编排提示词模板，支持变量占位符 {{variable}} */
  promptTemplate: string;

  /** 提示词模板中的变量声明 */
  variables?: {
    name: string;
    description: string;
    required: boolean;
    defaultValue?: string;
  }[];

  /** 此技能依赖的工具 ID 列表 */
  requiredTools: string[];

  /** 可选的辅助脚本路径（相对于 workspace） */
  scripts?: string[];

  /**
   * 输入描述：此技能接收什么样的任务
   * 用自然语言描述，供模型判断是否匹配
   */
  inputDescription: string;

  /**
   * 输出描述：此技能的产出是什么
   * 用自然语言描述
   */
  outputDescription: string;

  /** 预估执行时间（秒），供调度器参考 */
  estimatedDuration?: number;

  /** 使用示例 */
  examples?: {
    input: string;
    expectedOutput: string;
  }[];
}
```

### **Skill 调用协议**

```
/** 技能执行请求 */
interface SkillExecuteRequest {
  /** 请求唯一 ID */
  requestId: string;
  /** 目标技能 ID */
  skillId: string;
  /** 模板变量赋值 */
  variables: Record<string, string>;
  /** 附加上下文（注入到提示词中） */
  context?: string;
  /** 调用来源 */
  caller: {
    entityId: string;
    nodeId?: string;
  };
}

/** 技能执行响应 */
interface SkillExecuteResponse {
  requestId: string;
  success: boolean;
  /** 最终输出结果 */
  result?: string;
  /** 执行过程中产生的中间产物 */
  artifacts?: Artifact[];
  error?: {
    code: ToolErrorCode;
    message: string;
    retryable: boolean;
  };
  /** 实际调用的工具记录 */
  toolCalls: ToolCallRecord[];
  duration: number;
}

/** 工具调用记录（审计用） */
interface ToolCallRecord {
  toolId: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  success: boolean;
  duration: number;
}

/** 产物定义，参考 A2A 的 Artifact 概念 */
interface Artifact {
  /** 产物唯一 ID */
  id: string;
  /** 产物类型 */
  type: 'text' | 'file' | 'data';
  /** 产物名称 */
  name: string;
  /** MIME 类型 */
  mimeType?: string;
  /** 文本内容（type 为 text 时） */
  text?: string;
  /** 文件路径（type 为 file 时） */
  filePath?: string;
  /** 结构化数据（type 为 data 时） */
  data?: Record<string, unknown>;
}
```

---

## **五、Solution（Agent）层协议**

Solution 是具备身份、知识库、技能组的交互式智能体，对应 A2A 中的 Agent。

```
/** Agent 定义 */
interface SolutionDefinition extends EntityCard {
  type: EntityType.Solution;

  /** 身份定义提示词 */
  identityPrompt: string;

  /** 知识库配置 */
  knowledge?: {
    /** 静态知识文件路径列表 */
    staticFiles?: string[];
    /** qmd 向量库中的知识前缀（用于按需加载） */
    vectorPrefix?: string;
    /** 最大知识加载 token 数 */
    maxTokens?: number;
  };

  /** 绑定的技能 ID 列表 */
  skills: string[];

  /** 可使用的工具 ID 列表（除技能自带的工具外额外授权的） */
  additionalTools?: string[];

  /** 交互模式 */
  interaction: {
    /** 是否支持多轮对话 */
    multiTurn: boolean;
    /** 最大交互轮次（防止无限对话），默认 50 */
    maxTurns?: number;
    /** 是否需要人工参与（human-in-the-loop） */
    humanInLoop: boolean;
    /** 支持的输入类型 */
    inputModes: ('text' | 'file' | 'data')[];
    /** 支持的输出类型 */
    outputModes: ('text' | 'file' | 'data')[];
  };

  /** Agent 独立工作空间的根路径（相对于父级 workspace） */
  workspacePath: string;

  /** 记忆配置 */
  memory?: {
    /** 是否启用短期记忆 */
    shortTerm: boolean;
    /** 是否启用长期记忆 */
    longTerm: boolean;
    /** Hot Session 最大 token 数 */
    hotSessionMaxTokens?: number;
  };
}
```

### **Agent 任务协议**

借鉴 A2A 的 Task 生命周期，定义 Agent 任务的状态机：

```
/** 任务状态 */
enum TaskState {
  Submitted = 'submitted',       // 已提交，等待处理
  Working = 'working',           // 执行中
  InputRequired = 'input-required', // 需要用户输入
  Paused = 'paused',             // 已暂停（审查程序干预或用户主动暂停）
  Completed = 'completed',       // 已完成
  Failed = 'failed',             // 已失败
  Cancelled = 'cancelled',       // 已取消
}

/** 任务定义 */
interface Task {
  /** 任务唯一 ID */
  id: string;
  /** 所属 Agent ID */
  agentId: string;
  /** 父任务 ID（用于构建执行树） */
  parentTaskId?: string;
  /** 当前状态 */
  state: TaskState;
  /** 任务描述 */
  description: string;
  /** 消息历史 */
  messages: Message[];
  /** 产物列表 */
  artifacts: Artifact[];
  /** 创建时间 */
  createdAt: string;
  /** 最后更新时间 */
  updatedAt: string;
  /** 状态变更历史（审计追踪） */
  stateHistory: {
    from: TaskState;
    to: TaskState;
    reason: string;
    timestamp: string;
    /** 触发者：agent 自身 | inspector 审查程序 | user 用户 */
    triggeredBy: 'agent' | 'inspector' | 'user';
  }[];
}

/** 消息定义，参考 A2A Message */
interface Message {
  /** 消息唯一 ID */
  id: string;
  /** 发送者角色 */
  role: 'user' | 'agent' | 'system' | 'inspector';
  /** 消息内容（支持多部分，参考 A2A 的 Part 概念） */
  parts: Part[];
  /** 时间戳 */
  timestamp: string;
}

/** 消息内容部分 */
type Part =
  | { type: 'text'; text: string }
  | { type: 'file'; filePath: string; mimeType: string }
  | { type: 'data'; data: Record<string, unknown> };
```

### **Agent 通信接口**

Agent 之间以及 Agent 与系统之间的通信统一使用以下接口：

```
/** 向 Agent 发送任务 */
interface SendTaskRequest {
  /** 目标 Agent ID */
  agentId: string;
  /** 任务描述 */
  task: string;
  /** 注入上下文（仅包含分支任务需要的信息） */
  context?: string;
  /** 附件 */
  attachments?: Artifact[];
  /** 父任务 ID */
  parentTaskId?: string;
}

interface SendTaskResponse {
  /** 创建的任务 */
  task: Task;
}

/** 查询任务状态 */
interface GetTaskRequest {
  taskId: string;
}

/** 取消任务 */
interface CancelTaskRequest {
  taskId: string;
  reason: string;
}

/** 向任务补充输入（当状态为 input-required 时） */
interface ProvideInputRequest {
  taskId: string;
  message: Message;
}
```

---

## **六、Super Agent 层协议**

Super Agent 是多 Agent 的协作编排体，定义职责分工和协作规范。

```
/** Super Agent 定义 */
interface SuperAgentDefinition extends EntityCard {
  type: EntityType.SuperAgent;

  /** 整体职责定义提示词 */
  responsibilityPrompt: string;

  /** 组成 Agent 列表 */
  agents: AgentRole[];

  /** 协作规范 */
  collaboration: CollaborationSpec;

  /** 工作空间根路径 */
  workspacePath: string;
}

/** Agent 角色定义 */
interface AgentRole {
  /** 角色名称，如 "UI设计师"、"后端开发" */
  roleName: string;
  /** 角色职责描述 */
  responsibility: string;
  /** 对应的 Solution（Agent）ID */
  agentId: string;
  /** 此角色在工作流中的依赖关系（依赖哪些其他角色的产出） */
  dependsOn?: string[];
}

/** 协作规范 */
interface CollaborationSpec {
  /**
   * 协作模式
   * - sequential: 严格按依赖顺序串行执行
   * - parallel: 无依赖关系的角色并行执行
   * - orchestrated: 由编排 Agent 动态决定执行顺序
   */
  mode: 'sequential' | 'parallel' | 'orchestrated';

  /** 编排 Agent ID（mode 为 orchestrated 时必须） */
  orchestratorAgentId?: string;

  /** Agent 间消息传递规则 */
  messageRouting: {
    /** 是否允许 Agent 之间直接通信 */
    directMessaging: boolean;
    /** 是否所有消息都需经过编排者中转 */
    hubAndSpoke: boolean;
  };

  /** 冲突解决策略 */
  conflictResolution: {
    /** 当多个 Agent 产出冲突时的处理方式 */
    strategy: 'orchestrator-decides' | 'voting' | 'user-decides';
    /** 超时时间（秒），超时后自动升级给用户 */
    timeout: number;
  };

  /** 全局约束 */
  constraints?: {
    /** 总体执行时间上限（秒） */
    maxDuration?: number;
    /** 总 token 预算 */
    maxTokenBudget?: number;
    /** 最大并行 Agent 数 */
    maxParallelAgents?: number;
  };
}
```

---

## **七、执行树协议**

执行树是 ReAct 过程中产生的任务分解结构，需要支持持久化、回滚和审查干预。

```
/** 执行树节点 */
interface ExecutionNode {
  /** 节点唯一 ID */
  id: string;
  /** 父节点 ID（根节点为 null） */
  parentId: string | null;
  /** 对应的任务 ID */
  taskId: string;
  /** 节点状态 */
  state: TaskState;
  /** 节点类型 */
  nodeType: 'root' | 'tool-call' | 'model-call' | 'agent-call';
  /** 节点描述（摘要） */
  summary: string;
  /** 执行结果摘要（用于上下文压缩） */
  resultSummary?: string;
  /** 子节点 ID 列表 */
  children: string[];
  /** 重试次数 */
  retryCount: number;
  /** 创建时间 */
  createdAt: string;
  /** 完成时间 */
  completedAt?: string;
}

/** 执行树 */
interface ExecutionTree {
  /** 树唯一 ID */
  id: string;
  /** 所属 Agent ID */
  agentId: string;
  /** 根节点 ID */
  rootNodeId: string;
  /** 所有节点（id -> node 映射） */
  nodes: Record<string, ExecutionNode>;
  /** 当前活跃节点 ID */
  activeNodeId: string;
  /** 树状态 */
  state: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  /** 创建时间 */
  createdAt: string;
}
```

### **审查干预接口**

```
/** 审查程序可执行的干预动作 */
interface InspectorAction {
  /** 目标执行树 ID */
  treeId: string;
  /** 干预类型 */
  action: 'rollback' | 'terminate' | 'inject-prompt' | 'pause' | 'resume';
  /** 目标节点 ID（rollback 时回退到此节点） */
  targetNodeId?: string;
  /** 注入的提示词（inject-prompt 时使用） */
  prompt?: string;
  /** 干预原因 */
  reason: string;
  /** 时间戳 */
  timestamp: string;
}

/** 异常分类，供审查程序决策 */
enum ExceptionType {
  /** 工具执行失败——建议重试或换工具 */
  ToolFailure = 'tool-failure',
  /** 模型输出不合预期——建议调整提示词重新生成 */
  ModelOutputUnexpected = 'model-output-unexpected',
  /** 子 Agent 整体偏离——建议终止子树并上报 */
  AgentDeviation = 'agent-deviation',
  /** 疑似死循环——建议回退并注入异常提示词 */
  PossibleLoop = 'possible-loop',
  /** 执行超时 */
  Timeout = 'timeout',
  /** 资源耗尽 */
  ResourceExhausted = 'resource-exhausted',
}

/** 异常上报 */
interface ExceptionReport {
  treeId: string;
  nodeId: string;
  exceptionType: ExceptionType;
  description: string;
  /** 建议的处理动作 */
  suggestedAction: InspectorAction['action'];
  timestamp: string;
}
```

---

## **八、状态持久化协议**

系统状态的序列化与恢复规范。

```
/** 系统状态快照 */
interface SystemStateSnapshot {
  /** 快照版本（用于兼容性校验） */
  schemaVersion: string;
  /** 快照时间 */
  timestamp: string;
  /** 当前活跃的 Agent 依赖树 */
  agentTree: {
    /** 根 Agent ID */
    rootAgentId: string;
    /** Agent 间的父子关系 */
    hierarchy: Record<string, string[]>;
  };
  /** 每个 Agent 的执行树状态 */
  executionTrees: Record<string, ExecutionTree>;
  /** Hot Session 数据 */
  hotSessions: Record<string, string>;
  /** 检查点触发来源 */
  checkpointTrigger: 'agent-created' | 'agent-destroyed' | 'tool-completed'
    | 'inspector-intervened' | 'periodic' | 'user-requested';
}
```

### **持久化触发时机**

| **触发事件** | **优先级** | **说明** |
| --- | --- | --- |
| 子 Agent 创建/销毁 | 高 | Agent 依赖树结构变更 |
| 审查程序干预后 | 高 | 关键决策点，必须记录 |
| 工具调用完成后 | 中 | 执行树节点推进 |
| 定时检查点 | 低 | 兜底策略，间隔可配置（默认 5 分钟） |
| 用户主动请求 | 高 | 用户触发保存 |

### **恢复流程**

1. 系统启动时检查 `workspace/state/snapshot.json` 是否存在
2. 校验 `schemaVersion` 与当前系统版本的兼容性
3. 重建 Agent 依赖树和各 Agent 的 Workspace
4. 恢复各执行树，将状态为 `running` 的节点标记为 `paused`
5. 等待用户确认后恢复执行，或由用户选择放弃恢复

---

## **九、Workspace 目录规范**

```
workspace/
├── config.json                    # 系统配置
├── state/
│   └── snapshot.json              # 状态快照
├── prompts/                       # 动态提示词
│   ├── system/                    # 系统级提示词
│   ├── agents/                    # Agent 身份提示词
│   └── skills/                    # Skill 编排提示词
├── tools/                         # 自定义工具
│   ├── registry.json              # 工具注册表（EntityCard 数组）
│   └── scripts/                   # 工具脚本文件
├── skills/                        # 自定义技能
│   ├── registry.json              # 技能注册表
│   └── scripts/                   # 辅助脚本
├── solutions/                     # Agent 定义
│   └── registry.json              # Agent 注册表
├── super-agents/                  # Super Agent 定义
│   └── registry.json              # Super Agent 注册表
├── agents/                        # 运行时 Agent 实例
│   └── {agent-name}/
│       └── workspace/             # 子 Agent 独立工作空间（递归同构）
├── memory/
│   ├── short/                     # 短期记忆（yyyy-MM-dd.md）
│   └── long/                      # 长期记忆摘要
├── logs/                          # 日志（yyyy-MM-dd.log）
├── tmp/                           # 临时文件（任务完成后清理）
└── vectors/                       # qmd 向量库数据
```

### **注册表文件格式**

每个 `registry.json` 的结构：

```
interface Registry<T extends EntityCard> {
  /** 注册表版本 */
  version: string;
  /** 最后更新时间 */
  updatedAt: string;
  /** 实体列表 */
  entities: T[];
}
```

---

## **十、版本兼容性**

协议版本遵循语义化版本规范（SemVer）：

- **主版本号**（MAJOR）：不兼容的协议变更
- **次版本号**（MINOR）：向后兼容的新增功能
- **修订号**（PATCH）：向后兼容的问题修复

当前协议版本：`1.0.0`

所有持久化文件和注册表都必须包含 `schemaVersion` 字段，系统加载时校验兼容性。不兼容时提供迁移脚本或拒绝加载并给出提示。

---

## **附录 A：与业界标准的关系**

| **Ouroboros 概念** | **MCP 对应** | **A2A 对应** |
| --- | --- | --- |
| EntityCard | Tool Definition | Agent Card |
| Tool | Tool | — |
| Skill | Prompt（带 Tool 编排） | — |
| Solution（Agent） | — | A2A Server |
| Super Agent | — | 多 Agent 协作（A2A 生态） |
| Task / 执行树 | — | Task（含生命周期状态机） |
| Artifact | Tool Result | Artifact |
| Part | — | Part（TextPart/FilePart/DataPart） |
| 审查干预 | — | — (Ouroboros 特有) |
| 权限声明 | — | Agent Card 的 auth 声明 |

### **与 MCP/A2A 的差异**

Ouroboros 是**系统内部协议**，不涉及跨网络的 Agent 互操作。因此：

1. 不使用 JSON-RPC 和 HTTP 传输层，直接使用 TypeScript 函数调用
2. 不需要 OAuth 等网络认证机制，使用本地权限声明
3. 增加了 MCP 和 A2A 都不涉及的执行树管理、审查干预、状态持久化等内部调度能力
4. 保留了未来暴露 A2A 兼容接口的扩展可能——Solution 可以包装为 A2A Server 对外提供服务

---

## **附录 B：JSON Schema 示例**

### **Tool 注册示例**

```
{
  "id": "tool:web-search",
  "type": "tool",
  "name": "Web Search",
  "description": "使用搜索引擎检索互联网信息，返回相关网页的标题、摘要和链接",
  "tags": ["search", "web", "internet"],
  "version": "1.0.0",
  "status": "active",
  "permissions": {
    "network": true,
    "shellExec": false,
    "modelAccess": false
  },
  "origin": "system",
  "createdAt": "2025-01-01T00:00:00Z",
  "updatedAt": "2025-01-01T00:00:00Z",
  "entrypoint": "builtin:web-search",
  "timeout": 15000,
  "async": true,
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "搜索关键词" },
      "limit": { "type": "number", "description": "返回结果数量", "default": 5 }
    },
    "required": ["query"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "results": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "title": { "type": "string" },
            "url": { "type": "string" },
            "snippet": { "type": "string" }
          }
        }
      }
    }
  }
}
```

### **Skill 注册示例**

```
{
"id":"skill:twitter-aggregator",
"type":"skill",
"name":"Twitter 信息聚合",
"description":"聚合 Twitter 上特定主题的推文，按时间和互动量排序，生成摘要报告",
"tags": ["twitter","social-media","aggregation"],
"version":"1.0.0",
"status":"active",
"permissions": {
"network":true,
"modelAccess":true
  },
"origin":"system",
"createdAt":"2025-01-01T00:00:00Z",
"updatedAt":"2025-01-01T00:00:00Z",
"promptTemplate":"你是一个社交媒体分析师。请针对主题「{{topic}}」，在过去 {{timeRange}} 内的推文中，筛选出互动量最高的 {{limit}} 条，按以下格式输出摘要报告...",
"variables": [
    {"name":"topic","description":"聚合主题关键词","required":true },
    {"name":"timeRange","description":"时间范围","required":false,"defaultValue":"24小时" },
    {"name":"limit","description":"返回条数","required":false,"defaultValue":"10" }
  ],
"requiredTools": ["tool:web-search","tool:web-fetch"],
"inputDescription":"用户提供一个主题关键词，可选指定时间范围和数量",
"outputDescription":"按互动量排序的推文摘要报告，包含原文链接",
"estimatedDuration":60
```
