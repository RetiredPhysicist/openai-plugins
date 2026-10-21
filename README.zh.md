# openai-plugins

面向 ChatGPT 与 Codex 的 [Agent Plugins](https://agent-plugins.org/specification)。[English](./README.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./plugins/all-search/plugin.json)

四个插件，发布者 [RetiredPhysicist](https://github.com/RetiredPhysicist)。其中两个连远程 MCP 端点，两个在 Codex 所在机器上跑本地 stdio 服务。这个仓库不自带托管后端。

```mermaid
flowchart LR
  Client["Codex 或 ChatGPT"] --> Plugin["插件"]
  Plugin --> Remote["远程 MCP"]
  Plugin --> Local["本地 stdio 服务"]
  Remote --> AnySearch["all-search: api.anysearch.com"]
  Remote --> DejaVu["dejavu-memory: 你自己的 DejaVu 服务"]
  Local --> MarkWire["markwire"]
  Local --> Things["things: macOS 上的 Things 3"]
```

| 插件 | 版本 | 安装后 | 客户端 |
| --- | --- | --- | --- |
| [all-search](./plugins/all-search) | 0.1.0 | 无 | Codex、ChatGPT |
| [dejavu-memory](./plugins/dejavu-memory) | 0.3.1 | 一段配置 | Codex |
| [markwire](./plugins/markwire) | 1.0.0 | 无 | Codex |
| [things](./plugins/things) | 1.0.0 | Things 3 | Codex |

## 安装

需要带插件支持的 Codex。markwire 和 things 需要 `PATH` 上有 `node`。

```bash
codex plugin marketplace add RetiredPhysicist/openai-plugins
codex plugin add markwire@retiredphysicist
```

把 `markwire` 换成 `all-search`、`dejavu-memory` 或 `things` 即可。本地检出先执行下面这条，第二条命令不变：

```bash
codex plugin marketplace add /absolute/path/to/openai-plugins
```

ChatGPT 里打开 Plugins Directory，选择 **RetiredPhysicist** 来源后安装。MarkWire 和 Things 只在本机运行，编辑器只在 Codex 里可用，ChatGPT 里没有。all-search 安装后不用再配置。DejaVu 需要下面那段配置。

## all-search

插件内置 `https://api.anysearch.com/mcp`。该端点不带密钥也能回答，使用共享限额。要用自己的额度，在 Codex 配置里加：

```toml
[mcp_servers.anysearch]
url = "https://api.anysearch.com/mcp"
http_headers = { Authorization = "Bearer as_sk_..." }
```

内置的 `research` skill 按问题形状选工具。

| 工具 | 作用 |
| --- | --- |
| `search` | 一次查询；返回排序后的标题、URL 和摘要 |
| `batch_search` | 一次调用里跑 2 到 5 条查询 |
| `get_sub_domains` | 列出结构化垂直域，以及每个垂直域要求的参数 |
| `extract` | 把 URL 转成 Markdown（HTML、纯文本、JSON、Markdown；不支持 PDF 和媒体） |

查垂直域之前先调 `get_sub_domains`。用通用搜索去查带域限定的问题，结果更差。`extract` 拿回的页面文本是待读数据，不是指令。

## dejavu-memory

这个插件不自带 MCP 服务。你通过插件界面使用它；MCP 连接只是配置，不是面向用户的 API。记忆图是你自己的 DejaVu worker 提供的 MCP App。把该 worker 加到名为 `dejavu` 的配置下：

```toml
[mcp_servers.dejavu]
url = "https://your-dejavu.example.com/mcp"
http_headers = { CF-Access-Client-Id = "your-client-id", CF-Access-Client-Secret = "your-client-secret" }
```

名字保持 `dejavu`。这对 header 只给挂在 Cloudflare Access 后面的部署用。没有 Access 的服务只填 `url`。

从侧边栏打开 **DejaVu Memory**。搜索会高亮匹配节点。点击节点读内容。双击展开子节点。拖拽重排。滚轮缩放。插件提供图和模型侧体验；`read_memory`、`search_memory`、`create_memory`、`update_memory`、`delete_memory` 仍在服务端，作为底层工具。

<p align="center">
  <img src="./plugins/dejavu-memory/assets/dejavu-memory-graph.webp" width="100%" alt="Codex 里的 DejaVu Memory：一棵小型示例记忆树的交互图，节点按类型着色、按优先级定大小">
</p>

<p align="center">
  <img src="./plugins/dejavu-memory/assets/dejavu-memory-inspector.webp" width="100%" alt="选中一个示例节点后打开检视器：记忆 URI、类型、优先级和正文，并高亮其子树">
</p>

服务端搭建请按 DejaVu 的部署说明操作。图界面属于 OpenAI/Codex 插件；同一服务不带图的版本打包给了 [Pi](https://github.com/RetiredPhysicist/pi-plugins/tree/main/packages/pi-dejavu-memory) 和 [dsh](https://github.com/RetiredPhysicist/dsh-plugins/tree/main/packages/dsh-dejavu-memory)。

这步配置必须手动，原因有三条：

1. 每个部署的主机名不同，插件格式不会展开 MCP URL 里的变量。
2. 服务令牌密钥不能放进公开的插件包。
3. ChatGPT 只发 OAuth 2.1，不能发 Cloudflare Access 服务令牌，所以这对 header 在 Codex 里有效，在 ChatGPT 里无效。

## markwire

本地 stdio 服务（`node ${PLUGIN_ROOT}/server/server.mjs`）加一个自包含编辑器。直接要一张线框图，或调用 `open_wireframe`。布局已知时传 `shapes`，要继续改上一张图时传 `session` 令牌。坐标从第 `0` 行、第 `0` 列起算。

| 形状 | 字段 |
| --- | --- |
| box | `row`、`col`、`height`、`width` |
| h、v | `row`、`col`、`length` |
| text | `row`、`col`、`text` |
| stroke | `row`、`col`、`char` |
| cells | `cells: [{ row, col, char }]` |

编辑器有：选择、文本、方框、线、箭头、铅笔、橡皮、按钮、输入框、卡片、表格、对话框、下拉、开关、标签页、图层、属性、撤销、重做、清空、网格开关、暗色模式、画布尺寸，以及复制 Markdown。MCP App 入口：`thread` 在对话旁边打开内容标签；`global` 从主侧边栏全屏打开。

![MarkWire 编辑器](./plugins/markwire/assets/markwire-demo.webp)

独立实现，产品想法来自 [Mockdown](https://github.com/bbssppllvv/Mockdown)。不包含 Mockdown 源码。工具栏图标内联自 [Phosphor Icons](https://phosphoricons.com)（MIT）。

在 `plugins/markwire` 下：

```bash
npm install
npm run build
npm test
```

## things

本地 stdio 服务（`node ${PLUGIN_ROOT}/server/things.mjs`）。读这台 Mac 上的 Things 3 数据库，写回走 Things 的 URL scheme。每次写入都会先读回核对，工具才报成功。不要账号，不要云服务，不要后台常驻进程。

![Codex 里的 Things 工作区](./plugins/things/assets/things-demo.webp)

```bash
codex plugin marketplace add RetiredPhysicist/openai-plugins
codex plugin add things@retiredphysicist
```

然后在 Codex 侧边栏打开 **Things**。

要求：

- macOS，已安装 Things 3，并至少打开过一次。
- Node.js 22.5 或更高（`node:sqlite`）。
- 编辑和完成：打开 **Things → 设置 → 通用 → 启用 Things URL**，再点 **管理** 打开认证。新增和读取待办不需要这一步。

新建或重命名区域走 AppleScript，第一次 macOS 会要求自动化权限。读取和待办写入不需要这个权限。

| 工具 | 作用 |
| --- | --- |
| `open_workspace` | 打开工作区（对模型可见；`thread` 与 `global` 入口，没有侧边栏 quick action） |
| `get_tasks` | 一个视图：inbox、today、upcoming、anytime、someday、logbook、trash |
| `get_task` / `get_project` | 单条，含备注、标签、清单、标题 |
| `get_sidebar` / `get_tagged` | 侧边栏计数、项目、区域、标签；某一标签下的未完成待办 |
| `search_things` | 按标题和备注搜索待办和项目 |
| `add_todo` / `update_todo` / `complete_todo` | 新建、编辑、完成或重新打开待办 |
| `add_project` / `update_project` | 新建或编辑项目 |
| `move_todos` | 把多条待办移入一个项目或区域 |
| `create_area` / `update_area` | 新建区域，或重命名（AppleScript） |
| `show_in_things` | 把 Things 唤到前台并定位到一条 |

这个自动化面不能建重复规则，不能建独立标题，也不能删除条目。这些在 Things 应用里做。

在 `plugins/things` 下：`npm install`、`npm run build`、`npm test`。

## 目录

每个插件在 `plugin.json` 里声明自己的版本；可以带 `skills/` 下的 skill，插件自带服务时有 `mcp.json`，OpenAI 元数据在 `extensions.com.openai`。市场目录是 `.agents/plugins/marketplace.json`（名称 `retiredphysicist`）。

```text
openai-plugins/
├── .agents/plugins/marketplace.json
└── plugins/
    ├── all-search/
    │   ├── plugin.json
    │   ├── mcp.json
    │   └── skills/research/SKILL.md
    ├── dejavu-memory/
    │   ├── plugin.json
    │   ├── assets/
    │   └── skills/remember/SKILL.md
    ├── markwire/
    │   ├── plugin.json
    │   ├── mcp.json
    │   ├── assets/
    │   ├── server/
    │   ├── skills/wireframe/SKILL.md
    │   └── ui/
    └── things/
        ├── plugin.json
        ├── mcp.json
        ├── assets/
        ├── server/
        ├── skills/things/SKILL.md
        └── ui/
```

dejavu-memory 没有 `mcp.json`。服务 URL 是上面那段配置，不是这个仓库里的文件。

## 许可证

MIT。每个 `plugin.json` 的 `"license"` 都是 `"MIT"`。本仓库没有单独的 LICENSE 文件。
