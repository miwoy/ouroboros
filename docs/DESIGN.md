# Ouroboros  设计方案（DESIGN）

主要是调度程序合理的规划模型+提示词，生成文本或tool cal，tool call 再次使用agent，形成 Core 自指循环。

关于工具，Skill， Super Agent:

1. 工具是 Agent Core 在 ReAct 时候可以调用的计算机软件（脚本）的集合，包含 runAgent 对本身调用的自指行为。
2. Skill是为了实现某个具体功能的逻辑封装，通常包含一个任务编排的提示词，以及辅助的脚本（非必须）。比如对 Twitter 特定类型信息的聚合，通常需要在提示词模板中描写，为了实现这个功能的逻辑步骤
3.  Agent 是作为一个特定身份而为用户提供服务的智能体，通常包含一个身份定义，知识库，技能组，以及可交互的提示词模板，它不像Skill 一样只是为了实现某个单一功能的一次性交互模板，Agent 可能会与用户多次交互，比如 Coding 任务，就需要和用户确定需求，开发计划，执行，测试，验收等不断迭代的流程，就是在执行过程中用户可参与的。
4. Super Agent 是为了垂直领域提供一套解决方案的智能体集合，通常包含职责定义，一组不同身份的Agent，Agent 之间协作规范，比如做一款游戏，需要方案设计，UI 设计，音效设计，宣传视频设计，动画特效设计，以及开发，评审，多个Agent参与

他们是量级的区分，说到底也都是模型+提示词工程+工具+程序编排。由浅入深的说，不管是Agent Core，Agent，还是 Super Agent，他们都具备自相似的形式逻辑，位属于自相似系统的不同层面，所以他们之间的编排逻辑也是要相似的自指循环。就是 Agent Core 可以生成 Agent， Agent 可以生成 Super Agent

## 一、模型

---

对不同模型提供上接口封装，提供一致性服务，参考 [pi-momo-ai](https://github.com/badlogic/pi-mono/tree/main/packages/ai)

## 二、提示词

---

### 提示词分类

1. **核心提示词**（core.md）：系统提示词，安全边界、ReAct 核心、内置 tool/skill/solution 描述。不可被用户修改，直接从源码引用
2. **自我图式提示词**（self.md）：含 `{{variable}}` 模板变量，运行时渲染
    1. 身体图式：对运行自身的计算机的基础资源有一个感知，在任务规划时候不会导致资源使用溢出
    2. 灵魂图式：
        1. 环境认知：世界模型，关于世界的理解，规则与约束
        2. 自我认知：知道自己的存在意义、能力、目的
    3. 激素：激素指标会影响模型决策（指标作用描述 + 当前激素水平）
3. **自定义工具提示词**（tool.md）：用户自定义工具的名称、id、描述、路径。工具变化时动态累加，不含变量
4. **自定义技能提示词**（skill.md）：用户自定义技能的名称、id、描述、路径。技能变化时动态累加，不含变量
5. **自定义 Agent 提示词**（agent.md）：用户自定义 Agent 的名称、id、描述、路径。Agent 变化时动态累加，不含变量
6. **记忆提示词**：不含变量
    1. 长期记忆（memory.md）：将短期记忆汇总压缩成摘要记忆，持续累积
    2. 短期记忆（memory/*.md）：按日期文件（yyyy-MM-dd.md），记录所有交互的完整记录，按需加载
    3. Session：当前会话的工作记忆
        1. Hot：保存在内存中，每次 callModel 都需要完整注入的必要提示词
        2. Cold：保存在临时文件中，每步骤结果缓存到本地，描述信息累加到 Hot Session，按需加载，任务结束后清理
7. 解决方案提示词（Super Agent）：职责定义，与 Agent 协作规范

> **注意**：内置工具、技能、解决方案的描述在 `core.md` 中，不暴露给用户修改。`tool.md`、`skill.md`、`agent.md` 仅记录用户自定义的内容。qmd 索引的文件（tool.md、skill.md、memory.md、memory/*.md）不使用 `{{variable}}` 变量，以确保关键词检索的准确性。

### 提示词文件体系

#### 项目源码模板（`src/prompt/template/`）

| 文件 | 用途 | 初始化行为 |
|------|------|-----------|
| `core.md` | 系统提示词：安全边界、ReAct 核心、内置 tool/skill/solution 描述。不可修改 | **直接引用**，不复制 |
| `self.md` | 自我图式模板：身体图式 + 灵魂图式（环境认知/自我认知/激素），含 `{{variable}}` 变量 | 复制到 workspace |
| `tool.md` | 自定义工具注册表模板：名称、id、描述、路径，无变量 | 复制到 workspace |
| `skill.md` | 自定义技能注册表模板：名称、id、描述、路径，无变量 | 复制到 workspace |
| `agent.md` | 自定义 Agent 注册表模板：名称、id、描述、路径，无变量 | 复制到 workspace |
| `memory.md` | 长期记忆模板：压缩摘要的基础结构，无变量 | 复制到 workspace |

#### workspace 运行时（`workspace/prompts/`）

| 路径 | 类型 | 说明 | qmd 索引 |
|------|------|------|----------|
| `self.md` | 文件 | 自我图式（从模板复制，含 `{{variable}}` 变量，运行时渲染更新） | 否（量小，直接加载） |
| `tool.md` | 文件 | 自定义工具注册表（名称+id+描述+路径，动态累加，无变量） | 是 |
| `skill.md` | 文件 | 自定义技能注册表（名称+id+描述+路径，动态累加，无变量） | 是 |
| `agent.md` | 文件 | 自定义 Agent 注册表（名称+id+描述+路径，量小，无变量） | 否（直接加载） |
| `memory.md` | 文件 | 长期记忆（压缩摘要，持续累积，无变量） | 是 |
| `memory/` | 目录 | 短期记忆（按日期文件 `yyyy-MM-dd.md`，详细交互+Context，无变量） | 是 |

### 存储格式

提示词文件使用 YAML frontmatter + markdown 正文：

```markdown
---
type: skill
name: "技能注册表"
description: "技能名称、id、描述、路径"
tags: ["技能", "注册表"]
version: "1.0.0"
---
# 技能注册表

| 名称 | ID | 描述 | 路径 |
|------|-----|------|------|
```

### qmd 向量索引

- `@tobilu/qmd` 作为项目依赖，通过 `npx qmd` 调用（无需全局安装）
- 环境隔离：`XDG_CACHE_HOME={workspace}/vectors`，索引位于 `workspace/vectors/qmd/ouroboros.sqlite`
- 索引范围：只索引 tool.md、skill.md、memory.md、memory/ 目录
- collection add 后需显式 embed（add 不自动 embed）
- `initVectorIndex` 幂等（检查 collection 是否存在，不重复创建）
- qmd 不可用时，语义搜索自动回退到关键词搜索

### 装配优先级

提示词按以下优先级拼装（数值越小越靠前）：

```
core(0) → self(1) → agent(2) → skill(3) → tool(4) → memory(5)
```

## 三、工具、Skill、Solution

---

所有自定义内容都存储于 workspace 各个目录中，工具，Skill， Solution， Super Agent 的生成必须有标准协议支持，保持一致性接口规范.  

[**Ouroboros 标准协议（PROTOCOL）**](https://www.notion.so/Ouroboros-PROTOCOL-316d4991ae1c805d8b8fdc3cfad6fb1f?pvs=21)

[**Ouroboros 标准协议（PROTOCOL）（本地版）**](./PROTOCOL.md)

1. 一级：Agent最原始的工具能力，有了这些能力就可以构建所有二级能力
    1. callModel： 提供模型访问的能力，提示词外部注入
    2. runAgent：Agent 调用能力，与 calModel 比较，callModel更加原始，仅仅只是模型调用的能力，而Agent除了模型调用还有程序编排的能力，也就是它具备ReAct和工具调用的能力
    3. searchTool：工具查找能力，对于不同任务需要不同工具，去工具库检索
    4. createTool：在工具库未匹配到合适的工具时，主动创建工具的能力
2. 二级：一些可用一级工具构建的工具集，包含系统自带的工具和用户自定义和自生成的（Custom Tools）
    1. base: 命令执行
    2. read：读取文件
    3. write：创建或写内容到文件（会清空原文件内容）
    4. edit：修改文件内容
    5. find：查找文件
    6. webSearch: 搜索引擎
    7. webFetch：Url 访问
    8. searchSkill：检索技能库
    9. createSkill：创建技能
    10. Custom Tools： 自定义工具集
3. Skill： 工具编排的提示词+辅助脚本。包含系统自带的以及用户自定义或自生成的（Custom Skill）
    1. createSolution: 创建新的解决方案，一个 solution 是一个 Agent 的实例
    2. Custom Skills： 自定义技能库
4. Solution: 身份定义，知识库，技能组，以及可交互的提示词模板，包含系统自带的和用户自定义的
    1. createSuperAgent： 创建一个超级智能体
    2. Custom Agents： 自定义Agent

## 四、程序编排

---

### 核心

1. ReAct： 基础的 Agent Core Loop，使 Agent 可以一点一点处理问题
2. Logger： 记录Agent执行过程，方便跟踪和调试
3. 系统ReAct 阶段会产生一个任务分解执行树，在每个节点工具调用时(包括 calModel 和 runAgent)发生异常，需要询问审查程序后续操作，审查程序需要给出回退或终止任务。
4. 关于提示词装配，在 ReAct Loop 阶段，预留一个上下文压缩功能，暂时就把每个任务的摘要和结果累加起来，不要全量累加。runAgent 和 calModel 工具调用时，只提供分支任务需要的提示词注入，不需要将父节点提示词全量注入。
5. 执行树需要提供回滚和终止接口，在审查程序发现异常时能主动干预，回退或直接终止，比如审查程序发现执行树进入死循环时，及时将节点回退到死循环开始的节点，并注入异常提示词，好让节点重新规划。又或者执行树严重偏离了任务或执行时间太长，也可以直接终止执行树，像上报告异常情况。——工具执行失败（重试或换工具）、模型输出不合预期（调整提示词重新生成）、子 Agent 整体偏离（终止子树并上报）
6. 系统的中断与恢复： 系统需要状态保持，将当前运行状态持久化到本地中，每次系统启动时优先检查是否存在状态文件，如果存在尝试恢复。状态文件按照，Agent依赖树以及每个Agent 执行树构建一个整体的状态树

### 自我审视与反思（待办）

主要目的是一个挑刺的Agent，防止 Core 偏执，增加系统稳健性

1. 审查程序： 跟踪 Core Agent 执行过程，是否陷入死循环，是否固执己见，走向偏执的路线，是否真正的在解决问题。审查程序可以通过 ReAct 干预接口，注入提示词去干预执行树
2. 审查规则：
    1. 在ReAct执行阶段，3分钟（默认值3分钟，可配置）主动审查一下，在任务完成后主动停止审查进程。
    2. 在执行树主动报告错误时审查，给出回退或终止任务建议。
3. 反思程序：根据 Core Logger，总结解决方案是否优秀，是否有更好的解决方案，是否有可以封装的Skill，或者是解决方案，可定时触发，或在完成一次大型任务后（模型判断是否值得反思）。产出结果就是更新世界模型，更新长期记忆，总结解决方案和SKill，当然不是必须一定或得到产出，值的才去做

### 情绪系统（待办）

通过激励和自我感知，指引Agent 做合理的决策，解决安全问题，并在反思中学习。

## 五、Chat

---

将核心等 Agent 能力封装，接收处理用户消息，并格式化统一的人类可读的反馈信息， 最后暴露统一的 API 接口

## 六、Client

---

给用户提供可交互的软件

1. TUI（次优先）
2. Web UI（优先）
3. Application
4. Channel Bot（Telegram， Feishu）

## 补充

1. 项目使用 config.json 配置所有动态内容，使用 config.example.json 和 [CONFIGURE.md](http://CONFIGURE.md) 描述配置项，配置项需要给出是否必须，默认值和描述
2. 项目初始化后需要生成 workspace 工作空间，所有动态内容都存于这里，安全凭证需要单独处理。系统生成的 Agent 和 Super Agent，这些Agent也要有独立的Workspace 存放，比如 Base Agent 生成的 Child Agent  是存放在 workspace/agents 下的，而 Child Agent 的工作目录则在 workspace/agents/childAgent/workspace
3. 项目内需要动态按需加载的提示词，比如短期记忆，使用 https://github.com/tobi/qmd 储存并向量化，使用 query 动态装配
4. Custom Tools，Custom Skills 需要把名称和描述索引进 https://github.com/tobi/qmd 中，方便按需装配
5. Logger 日志存在 workspace/logs 下，按日期分隔，格式 yyyy-MM-dd.log
6. 短期记忆存于 workspace/prompts/memory 下，按日期分隔，格式 yyyy-MM-dd.md
7. 临时文件存于 workspace/tmp/ 中， 每次在使用完事必须清理这些文件，比如 Cold Session，在任务完成后需要清理
8. 系统要仿照 Nodejs的单线程非阻塞式异步模型，主线程同时只能处理一个任务，执行树阶段可根据是否需要并行工具调用，使用异步的方式进行并行工具调用 

## 开发规范

1. 使用最新的 Typescript
2. 项目架构合理，功能模块独立，结构清晰，低耦合。
3. 程序必须进行合理的异常处理，防止异常导致整个系统崩溃。
4. 程序必须带有完整单元测试，使用中文注释注解核心逻辑，函数以及类型必须给出中文注释，代码风格需要一致
5. 使用 git 管理项目版本，做好 gitignore
6. 项目包含四份文档
    1. README： 存于项目根目录，项目简介，以及项目使用教程
    2. DESIGN： 存于 docs ,项目设计文档，也就是此文档
    3. CONFIGURE：存于 docs，项目配置文件介绍
    4. ROADMAP： 存于根目录，开发计划以及开发进度，不需要 git 维护，只在开发阶段使用

# 灵感库(只是偶发灵感记录，不包含在设计文档中)

底层约束：第一性原理，最小作用量原理，奥卡姆剃刀

元认知：自我认知

自我博弈：系统稳健

情绪系统：指导方向

记忆系统：合理规划上下文窗口

自指，第一性原理，最小作用量原理，奥卡姆剃刀原理

A1：你接受的用户消息，输出的是解决问题的提示词

A2：你接受的是提示词，输出的是结果

A3：你接受的是Context，输出的返回给用户的消息
