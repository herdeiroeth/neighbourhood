# neighbourhood

> 🏘️ **零依赖局域网文件传输工具** — 在同一网络中即时共享文件。

![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![No Dependencies](https://img.shields.io/badge/dependencies-0-success)

`neighbourhood` 是一个轻量级、自包含的局域网文件传输工具。无需任何外部依赖 — 仅使用 Node.js 内置模块。支持断点续传、目录下载（流式 tar 打包）和美观的进度条。

**⚠️ 安全提示：** `neighbourhood` **没有身份验证或 TLS** — 请仅在可信网络中使用。默认监听 `0.0.0.0`（所有接口）且 CORS 完全开放。专为快速局域网迁移设计，不适合公网暴露。

---

## ✨ 功能特性

- **📂 浏览远程文件** — 从另一台机器列出目录内容
- **⬇️ 下载文件** — 单个文件下载，显示进度条、速度和预计完成时间
- **📁 下载目录** — 整个文件夹以 `.tar` 格式流式传输
- **⏯️ 断点续传** — 通过 HTTP Range 头部实现中断后恢复下载
- **🚫 零依赖** — 纯 Node.js 标准库（`http`、`fs`、`path`、`os`、`stream`）
- **🌐 局域网优化** — 专为本地网络速度和可靠性打造
- **🖥️ 跨平台** — 支持 Windows、macOS 和 Linux

---

## 📦 快速开始

```bash
# 无需 npm install！直接克隆并运行。

# 克隆仓库
git clone https://github.com/herdeiroeth/neighbourhood.git
cd neighbourhood

# 终端 1：启动服务器（共享当前目录）
node bin/server.js

# 终端 2：列出并下载文件
node bin/client.js localhost:3000 list /
node bin/client.js localhost:3000 get /package.json
node bin/client.js localhost:3000 get-dir /lib
```

---

## 🚀 使用方法

### 服务器端（拥有文件的机器）

```bash
# 在默认端口（3000）共享当前目录
node bin/server.js

# 共享指定目录并使用自定义端口
node bin/server.js /path/to/share --port 8080

# 或使用 PORT 环境变量
PORT=8080 node bin/server.js /path/to/share
```

**输出示例：**
```
  trans-server running
  Root: /Users/me/shared-files
  Local: http://localhost:3000
  LAN:   http://192.168.1.10:3000

  On the other machine run:
    node bin/client.js 192.168.1.10:3000 list /
```

### 客户端（局域网中的任意机器）

```bash
# 列出文件（ls 是 list 的别名）
node bin/client.js 192.168.1.10:3000 list /
node bin/client.js 192.168.1.10:3000 ls /Documents

# 下载单个文件
node bin/client.js 192.168.1.10:3000 get /photos/vacation.zip

# 下载整个目录（以 tar 格式流式传输）
node bin/client.js 192.168.1.10:3000 get-dir /Documents
```

中断的下载会留下一个 `.part` 文件 — 再次运行相同的 `get` 命令会自动通过 HTTP Range 头部续传。

---

## 📋 API 端点

用于高级使用或浏览器访问：

| 端点 | 方法 | 查询参数 | 描述 |
|---|---|---|---|
| `/api/list` | GET | `path` | 以 JSON 格式列出目录内容 |
| `/api/stat` | GET | `path` | 获取文件/目录元数据 |
| `/api/download` | GET | `path` | 下载文件（支持 Range/206 断点续传） |
| `/api/download-dir` | GET | `path` | 以 TAR 归档格式下载目录 |

---

## 🔧 架构

```
[机器 A - 源]                           [机器 B - 目标]
  trans-server                              trans-client
  rootDir ──► HTTP :3000 ── LAN ──► list / get / get-dir
              /api/list
              /api/stat
              /api/download      (文件, Range)
              /api/download-dir  (tar 流)
```

### 项目结构

```
.
├── bin/
│   ├── server.js          # 服务器 CLI 入口
│   └── client.js          # 客户端 CLI 入口
├── lib/
│   ├── client/
│   │   ├── index.js       # 参数解析和命令分发
│   │   ├── commands.js    # list / get / get-dir 实现
│   │   ├── progress.js    # 带速度和 ETA 的进度条
│   │   └── resume.js      # .part 文件管理和 Range 头部
│   ├── server/
│   │   ├── index.js       # HTTP 服务器 + 优雅关闭
│   │   ├── routes.js      # API 路由处理器（含路径安全）
│   │   └── tar-stream.js  # 流式 TAR 生成器（ustar 格式）
│   └── shared/
│       ├── protocol.js    # 端口和端点常量
│       └── format.js      # 大小、速度、日期格式化
├── package.json
├── README.md
├── README.zh.md
├── LICENSE
└── .gitignore
```

| 层 | 路径 | 作用 |
|---|---|---|
| CLI | `bin/` | 可执行入口点 |
| 服务器 | `lib/server/` | HTTP、路由、TAR 生成 |
| 客户端 | `lib/client/` | 命令、进度、续传逻辑 |
| 共享 | `lib/shared/` | 协议常量、格式化工具 |

**技术栈：**
- **运行环境：** Node.js ≥ 18（ES modules）
- **依赖：** 零（仅标准库）
- **协议：** 纯 HTTP/1.x（无 TLS）

---

## 🧪 手动测试

1. 启动服务器，指向一个测试目录
2. `list /` — 验证名称、类型和大小
3. `get` 一个小文件，然后一个大文件 — 测试中断 + 续传
4. `get-dir` — 验证本地解压结果
5. 尝试 `../` 路径穿越 — 应返回 403 Forbidden
6. 在服务器端按 Ctrl+C — 验证优雅关闭提示

---

## ⚠️ 安全与限制

该工具为局域网迁移**有意保持宽松权限**：

| 方面 | 当前行为 | 风险 |
|---|---|---|
| 身份认证 | 无 | 任何能访问端口的机器都可以列出和下载 |
| TLS | 无 | 流量在网络中为明文 |
| 绑定 | `0.0.0.0` | 监听所有接口 |
| CORS | `Access-Control-Allow-Origin: *` | 允许在局域网中通过浏览器访问 |
| 路径安全 | `safePath` 限制在 `rootDir` 内 | 可防御基本路径遍历攻击 |
| Tar 解压 | 对文件名中的 `..` 进行清理 | 减小类 zip-slip 问题风险 |

**使用建议：**
1. 仅在**可信的本地网络**中使用（或隔离隧道）
2. 请**不要**在路由器、广域网或开放 VPN 上暴露该端口，除非增加额外的认证措施
3. 将 `rootDir` 仅指向您实际需要迁移的目录
4. 传输完成后立即关闭服务器

**已知限制：**
- 没有身份认证、用户授权或访问审计
- 没有 HTTPS/TLS — 仅明文 HTTP
- TAR 实现为简化版 ustar：超过 100 个字符的文件名会被截断
- `get-dir` **不支持**续传（仅单文件 `get` 支持）
- 没有自动化测试、CI 或 lint 脚本
- 没有速率限制、大小限制或并发控制
- Windows 兼容性有 Git Bash 路径处理，但没有跨平台测试矩阵

---

## 📄 许可证

MIT © [herdeiroeth](https://github.com/herdeiroeth)

---

<p align="center">用 ❤️ 和零个 <code>node_modules</code> 打造</p>
