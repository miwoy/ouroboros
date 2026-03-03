# Tools

> 工具是最小可执行单元。每个工具有固定 inputSchema，按要求传参。

## Primary Tools

> 核心工具。

- **tool:call-model** — 模型调用：调用大语言模型进行推理、生成或决策。参数：messages(必填)、model、temperature、maxTokens、provider
- **tool:run-agent** — Agent 调用：启动子 Agent 执行复杂任务。参数：agentId(必填)、task(必填)、context。超时 300s
- **tool:search-tool** — 工具搜索：通过语义和关键词搜索工具注册表。参数：query(必填)、limit
- **tool:create-tool** — 工具创建：动态创建自定义工具并注册。参数：name(必填)、description(必填)、inputSchema(必填)、outputSchema(必填)、code(必填)、tags

## Secondary Tools

> 常用操作工具。

- **tool:bash** — 终端执行：在子进程中执行 shell 命令。参数：command(必填)、cwd、timeout
- **tool:read** — 读取文件：读取文件内容，支持行范围。参数：path(必填)、offset、limit
- **tool:write** — 写入文件：写入内容到文件，自动创建目录。参数：path(必填)、content(必填)
- **tool:edit** — 编辑文件：精确字符串替换（diff 编辑）。参数：path(必填)、oldString(必填)、newString(必填)、replaceAll
- **tool:find** — 查找文件：通过 glob 模式查找文件。参数：pattern(必填)、path、limit
- **tool:web-search** — 网络搜索：通过搜索引擎搜索互联网。参数：query(必填)、limit
- **tool:web-fetch** — 网页获取：获取指定 URL 的内容。参数：url(必填)、timeout
- **tool:search-skill** — 技能搜索：通过语义搜索技能注册表。参数：query(必填)、limit
- **tool:create-skill** — 技能创建：创建可复用的多工具编排模板。参数：name(必填)、description(必填)、promptTemplate(必填)、requiredTools、variables、tags

## Custom Tools

> 运行时创建的自定义工具。
