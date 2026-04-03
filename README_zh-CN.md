<p align="center">
  <img src="assets/banner.svg" alt="Oh-My-Brain Banner" width="800"/>
</p>

<p align="center">
  <strong>基于 Obsidian 的第二大脑 — 知识管理、网页剪藏、多 Agent 工作区编排，一个 Vault 搞定一切。</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-brightgreen?style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/Obsidian-v1.4.5+-7c3aed?style=flat-square&logo=obsidian&logoColor=white" alt="Obsidian">
  <img src="https://img.shields.io/badge/Node.js-v18+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Python-v3.10+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/TypeScript-Plugin-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
</p>

<p align="center">
  <a href="README.md">🇬🇧 English</a> · <a href="#-快速开始">快速开始</a> · <a href="#-功能特性">功能特性</a> · <a href="#-架构总览">架构总览</a>
</p>

---

## 🤔 Oh-My-Brain 是什么？

Oh-My-Brain 是一个面向重度用户的 **Obsidian Vault 模板**，提供一站式解决方案：

- 📚 **个人知识库** — 笔记、记忆与结构化思维
- ✂️ **网页剪藏** — 从浏览器收集文章与页面
- 🤖 **多 Agent 编排** — 挂载外部代码仓库，在一个 Vault 中协调多个 AI Agent
- 🎨 **可视化组织** — 目录着色系统，配色随 Vault 一起版本控制

自带自研 Obsidian 插件（**Oh My Brain**）和一键初始化脚本 — clone 一下即可开始。

<br/>

## ✨ 功能特性

### 🔌 Oh My Brain 插件

<table>
  <tr>
    <td width="50%">

**🎨 目录着色**

右键任意目录 → 从 27 种预设或自定义取色器中选择颜色。支持级联到子目录。配色通过 git 跟踪，clone 即得到相同配色。

</td>
    <td width="50%">

**🤖 外部 Agent 管理**

将本地代码仓库挂载为 Vault 子目录。仓库的 `CLAUDE.md` 自动通过 symlink 链接 — AI Agent 的上下文与笔记共存。

</td>
  </tr>
  <tr>
    <td>

**🔗 CLAUDE.md 链接与同步**

优先使用 symlink；不可用时自动降级为文件拷贝。支持命令面板或右键菜单一键重新同步。

</td>
    <td>

**⚙️ 双层颜色配置**

共享配色存储在 `folder-colors.json`（git 跟踪）+ 个人覆盖在 `data.json`（gitignore）。模型类似 VS Code 的设置系统。

</td>
  </tr>
</table>

<br/>

## 🏗️ 架构总览

<p align="center">
  <img src="assets/architecture.svg" alt="Vault 架构图" width="800"/>
</p>

<details>
<summary>📂 目录结构</summary>

```
oh-my-brain/
├── Brain/                  # 核心知识：SOUL.md、Memory.md
│   ├── SOUL.md             # Agent 身份定义与行为约束
│   └── Memory.md           # 持久运行时记忆与决策记录
├── Clippings/              # 网页剪藏
├── Skills/                 # 工作区技能定义文件
├── Agents/                 # 外部 Agent 工作区
│   └── <alias>/
│       └── CLAUDE.md       # → 外部仓库 CLAUDE.md 的 symlink
├── Output/                 # 生成产物：报告、幻灯片、图表
├── oh-my-brain-plugin/     # 插件源码与初始化脚本
│   ├── src/                # TypeScript 源码
│   ├── folder-colors.json  # 共享颜色配置（git 跟踪）
│   └── setup.py            # 一键初始化脚本
├── .obsidian/              # Obsidian 内部配置
└── CLAUDE.md               # AI Agent 项目指南
```

</details>

<br/>

## ⚡ 工作原理

<p align="center">
  <img src="assets/workflow.svg" alt="工作流程图" width="800"/>
</p>

Oh-My-Brain 充当**中央协调器**。知识、剪藏和外部 Agent 工作区全部在一个 Vault 中可见。自研插件负责目录着色和仓库挂载。AI Agent 通过读取 CLAUDE.md 文件来理解各工作区的上下文。

<br/>

## 🚀 快速开始

### 前置要求

| 工具 | 版本 | 用途 |
|------|------|------|
| [Obsidian](https://obsidian.md/) | v1.4.5+ | Vault 宿主 |
| [Node.js](https://nodejs.org/) | v18+ | 构建插件 |
| [Python 3](https://www.python.org/) | v3.10+ | 运行初始化脚本 |
| Git | 任意版本 | 克隆仓库 |

### 安装

```bash
# 1. 克隆 Vault
git clone https://github.com/<your-username>/oh-my-brain.git
cd oh-my-brain

# 2. 一键初始化 — 构建插件、下载依赖
python oh-my-brain-plugin/setup.py

# 3. 在 Obsidian 中打开
#    Obsidian → 打开文件夹作为仓库 → 选择 oh-my-brain/
#    设置 → 第三方插件 → 关闭安全模式 → 启用已安装插件
```

<details>
<summary>⚙️ 初始化选项</summary>

```bash
python oh-my-brain-plugin/setup.py --force          # 强制重新构建 / 安装所有插件
python oh-my-brain-plugin/setup.py --skip-build     # 跳过本地插件构建
python oh-my-brain-plugin/setup.py --skip-download   # 离线模式，跳过远程插件下载
```

</details>

### 附带插件

#### 必装插件（自动安装）

| 插件 | 来源 | 说明 |
|------|------|------|
| **Oh My Brain** | 本地 (`oh-my-brain-plugin/`) | 核心插件：目录着色、Agent 管理、CLAUDE.md 链接 |
| **Execute Code** | [twibiral/obsidian-execute-code](https://github.com/twibiral/obsidian-execute-code) | 在笔记中直接运行代码块（Python、JS、Shell 等 20+ 种语言） |

#### 可选插件（初始化时交互选择）

| 插件 | 来源 | 说明 |
|------|------|------|
| **Claudian** | [YishenTu/claudian](https://github.com/YishenTu/claudian) | Obsidian 内 Claude AI 对话（需配置 API Key） |
| **Marp Slides** | [samuele-cozzi/obsidian-marp-slides](https://github.com/samuele-cozzi/obsidian-marp-slides) | Markdown → 演示幻灯片 |
| **Excalidraw** | [zsviczian/obsidian-excalidraw-plugin](https://github.com/zsviczian/obsidian-excalidraw-plugin) | 白板绘图：图表、草图、思维导图 |

<br/>

## 📖 使用方法

### 🎨 设置目录颜色

1. 在文件管理器中右键任意目录
2. 点击 **Set folder color** → 选择颜色
3. 勾选 **Apply to children** 以级联到子项

> **共享 vs 个人**：保存到 `oh-my-brain-plugin/folder-colors.json` 的颜色通过 git 共享。插件 `data.json` 中的个人覆盖不会被跟踪。

### 🤖 添加外部 Agent

1. `Ctrl+P` → **Add External Agent**
2. 浏览选择本地仓库
3. 设置别名和颜色
4. 插件在 `Agents/<别名>/` 下创建目录并 symlink `CLAUDE.md`

### 🔄 同步 CLAUDE.md

- **单个 Agent**：右键 Agent 目录 → **Sync CLAUDE.md**
- **全部 Agent**：命令面板 → **Sync all agent CLAUDE.md files**

<br/>

## 🎨 颜色配置系统

插件采用双层配置模型 — 类似 VS Code 的设置：

```
┌─────────────────────────────────────────────────────┐
│  用户层 (data.json)               ← gitignored      │
│  按路径覆盖                                          │
├─────────────────────────────────────────────────────┤
│  共享层 (folder-colors.json)       ← git-tracked     │
│  所有用户的默认配色                                    │
└─────────────────────────────────────────────────────┘
         ▲ 同一路径下用户层优先
```

在插件设置中可关闭 **"Use shared colors"** 来完全禁用共享层。

<br/>

## 🛠️ 开发

```bash
cd oh-my-brain-plugin
npm install
npm run build          # 生产构建
# 产物输出 → .obsidian/plugins/oh-my-brain/
```

插件使用 **TypeScript + esbuild** 构建，源码在 `oh-my-brain-plugin/src/`。

<br/>

## 🗂️ 关键文件

| 文件 | 用途 |
|------|------|
| `CLAUDE.md` | 项目指南 — AI Agent 通过此文件了解 Vault 上下文 |
| `Brain/SOUL.md` | Agent 身份定义与行为约束 |
| `Brain/Memory.md` | 持久 Agent 记忆与经验 |
| `oh-my-brain-plugin/setup.py` | 一键 Vault 初始化脚本 |
| `oh-my-brain-plugin/folder-colors.json` | 共享目录颜色配置 |
| `oh-my-brain-plugin/src/` | 插件 TypeScript 源码 |

<br/>

## 🤝 贡献

欢迎贡献！请随时提交 Issue 或 Pull Request。

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

<br/>

## 📝 许可证

[MIT](LICENSE) © Xu Jihui

---

<p align="center">
  用 🧠 和 ☕ 打造 — 由 <a href="https://obsidian.md">Obsidian</a> 驱动
</p>
