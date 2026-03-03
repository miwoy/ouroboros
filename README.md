<p align="center">
  <img src="logo.png" alt="Ouroboros" />
</p>

<p align="center">
  <em>The Serpent Devours Itself to Be Reborn</em>
</p>

<p align="center">
  <b>Devour. Reflect. Evolve. </b>
</p>

---

Ouroboros 是一个分层递归的 Agent 框架。Agent 可以创建工具、技能和子 Agent，各层级之间保持自相似的形式逻辑，实现真正的自指循环。

## 核心特性

- **分层实体架构** — Tool → Skill → Agent，逐层抽象、自指递归
- **ReAct 推理循环** — Thought → Action → Observation，支持并行工具调用、执行树管理、死循环检测
- **多模型统一接口** — 基于 pi-ai，支持 OpenAI / Anthropic / Google / Mistral / Groq / Bedrock / Ollama / OpenAI Codex / GitHub Copilot 等，OAuth 免密认证
- **自我图式系统** — 身体图式（环境感知）+ 灵魂图式（世界模型）+ 激素系统（决策倾向）
- **分层记忆** — Hot Memory → Cold Memory → 短期记忆 → 长期记忆，四层渐进式持久化
- **自我审视** — 审查程序（防偏执）+ 反思程序（总结优化）+ 状态持久化与恢复
- **提示词引擎** — 模板变量 + 向量语义检索（qmd）+ 按优先级自动装配
- **三端交互** — Web UI (React) + TUI (终端) + REST API + WebSocket 实时推送

## 快速开始

```bash
# 安装
git clone git@github.com:miwoy/ouroboros.git
cd ouroboros && npm install

# 方式一：交互式配置向导（推荐）
npm run configure

# 方式二：手动配置
cp config.example.json config.json
# 编辑 config.json 配置模型提供商（详见 docs/CONFIGURE.md）

# OAuth 登录（ChatGPT/Copilot/Anthropic/Google 订阅用户）
npm run login -- openai-codex

# 启动后端
npm run dev

# 启动 Web UI（另一个终端）
cd web && npm install && npm run dev
# 访问 http://localhost:5173

# 或使用 TUI 终端界面
npm run tui
```

## 文档

| 文档 | 说明 |
|------|------|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | 架构详解 — 分层、目录结构、模块职责、数据流、API、使用示例 |
| [DESIGN](docs/DESIGN.md) | 系统设计文档 |
| [CONFIGURE](docs/CONFIGURE.md) | 配置项说明 |
| [PROTOCOL](docs/PROTOCOL.md) | 标准协议 — 实体接口规范 |

## 开发

```bash
npm test              # 运行测试
npm run test:watch    # 监视模式
npm run test:coverage # 覆盖率报告
npm run lint          # 代码检查
npm run format        # 格式化
```

## 许可证

ISC
