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

- **多模型支持**: 统一接口封装 OpenAI、Anthropic 及兼容 API（Ollama、vLLM 等）
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
│   │   └── providers/    # 提供商实现（OpenAI、Anthropic）
│   ├── errors/           # 错误体系
│   └── index.ts          # 入口
├── tests/                # 单元测试
├── docs/                 # 文档
│   ├── DESIGN.md         # 设计文档
│   └── CONFIGURE.md      # 配置说明
├── workspace/            # 运行时工作空间（自动生成，不入版本控制）
│   ├── prompts/          # 动态提示词
│   ├── tools/            # 自定义工具
│   ├── skills/           # 自定义技能
│   ├── agents/           # Agent 实例及其独立工作空间
│   ├── logs/             # 日志（按日期分隔）
│   ├── memory/           # 短期记忆（按日期分隔）
│   └── tmp/              # 临时文件（任务完成后清理）
├── config.example.json   # 配置模板
└── ROADMAP.md            # 开发计划（不入版本控制）
```

## 文档

| 文档 | 位置 | 说明 |
|------|------|------|
| [DESIGN](docs/DESIGN.md) | docs/ | 系统设计文档 |
| [CONFIGURE](docs/CONFIGURE.md) | docs/ | 配置项说明 |

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
