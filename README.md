# trans

> 🚀 **Zero-dependency LAN file transfer tool** — share files between machines on the same network instantly.

![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![No Dependencies](https://img.shields.io/badge/dependencies-0-success)

`trans` is a lightweight, self-contained file transfer tool for local networks. No external dependencies — just Node.js built-in modules. It features resume support, directory downloads (streamed as tar), and a beautiful progress bar.

**⚠️ Security notice:** `trans` has **no authentication or TLS** — use only on trusted networks. The default bind is `0.0.0.0` (all interfaces) and CORS is wide open. Designed for quick LAN migrations, not public exposure.

---

## ✨ Features

- **📂 Browse remote files** — list directories from another machine
- **⬇️ Download files** — single file downloads with progress bar, speed and ETA
- **📁 Download directories** — entire folders streamed as `.tar`
- **⏯️ Resume support** — interrupt and resume downloads via HTTP Range headers
- **🚫 No dependencies** — pure Node.js stdlib (`http`, `fs`, `path`, `os`, `stream`)
- **🌐 LAN optimized** — built for local network speed and reliability
- **🖥️ Cross-platform** — works on Windows, macOS, and Linux

---

## 📦 Quick Start

```bash
# No npm install needed! Just clone and run.

# Clone the repo
git clone https://github.com/herdeiroeth/trans.git
cd trans

# Terminal 1: Start the server (shares current directory)
node bin/server.js

# Terminal 2: List and download files
node bin/client.js localhost:3000 list /
node bin/client.js localhost:3000 get /package.json
node bin/client.js localhost:3000 get-dir /lib
```

---

## 🚀 Usage

### Server (machine with the files)

```bash
# Share the current directory on the default port (3000)
node bin/server.js

# Share a specific directory on a custom port
node bin/server.js /path/to/share --port 8080

# Or using PORT env var
PORT=8080 node bin/server.js /path/to/share
```

**Output:**
```
  trans-server running
  Root: /Users/me/shared-files
  Local: http://localhost:3000
  LAN:   http://192.168.1.10:3000

  On the other machine run:
    node bin/client.js 192.168.1.10:3000 list /
```

### Client (any machine on the LAN)

```bash
# List files (ls is an alias for list)
node bin/client.js 192.168.1.10:3000 list /
node bin/client.js 192.168.1.10:3000 ls /Documents

# Download a single file
node bin/client.js 192.168.1.10:3000 get /photos/vacation.zip

# Download an entire directory (streamed as tar)
node bin/client.js 192.168.1.10:3000 get-dir /Documents
```

Interrupted downloads leave a `.part` file — running the same `get` command again resumes automatically via HTTP Range headers.

---

## 📋 API Endpoints

For advanced use or browser access:

| Endpoint | Method | Query Param | Description |
|---|---|---|---|
| `/api/list` | GET | `path` | List directory contents as JSON |
| `/api/stat` | GET | `path` | Get file/directory metadata |
| `/api/download` | GET | `path` | Download a file (supports Range/206) |
| `/api/download-dir` | GET | `path` | Download a directory as TAR archive |

---

## 🔧 Architecture

```
[machine A - source]                    [machine B - destination]
  trans-server                            trans-client
  rootDir ──► HTTP :3000 ── LAN ──► list / get / get-dir
              /api/list
              /api/stat
              /api/download      (file, Range)
              /api/download-dir  (tar stream)
```

### Project structure

```
.
├── bin/
│   ├── server.js          # Server CLI entrypoint
│   └── client.js          # Client CLI entrypoint
├── lib/
│   ├── client/
│   │   ├── index.js       # Argument parser and command dispatch
│   │   ├── commands.js    # list / get / get-dir implementations
│   │   ├── progress.js    # Progress bar with speed and ETA
│   │   └── resume.js      # .part file management and Range headers
│   ├── server/
│   │   ├── index.js       # HTTP server + graceful shutdown
│   │   ├── routes.js      # API route handlers with path safety
│   │   └── tar-stream.js  # Streaming TAR generator (ustar format)
│   └── shared/
│       ├── protocol.js    # Port and endpoint constants
│       └── format.js      # Size, speed, date formatters
├── package.json
├── README.md
├── LICENSE
└── .gitignore
```

| Layer | Path | Role |
|---|---|---|
| CLIs | `bin/` | Executable entrypoints |
| Server | `lib/server/` | HTTP, routes, TAR generation |
| Client | `lib/client/` | Commands, progress, resume logic |
| Shared | `lib/shared/` | Protocol constants, formatting utilities |

**Stack:**
- **Runtime:** Node.js ≥ 18 (ES modules)
- **Dependencies:** Zero (stdlib only)
- **Protocol:** Plain HTTP/1.x (no TLS)

---

## 🧪 Manual Validation

1. Start the server pointing to a fixture directory
2. `list /` — verify names, types, and sizes
3. `get` a small file, then a large file — test interrupt + resume
4. `get-dir` — verify extraction locally
5. Try `../` path traversal — expect 403 Forbidden
6. Press Ctrl+C on the server — verify graceful shutdown message

---

## ⚠️ Security & Limitations

This tool is **deliberately permissive** for LAN migration:

| Aspect | Current behavior | Risk |
|---|---|---|
| Authentication | None | Any host reaching the port can list and download |
| TLS | None | Traffic is plaintext on the network |
| Bind | `0.0.0.0` | Listens on all interfaces |
| CORS | `Access-Control-Allow-Origin: *` | Enables browser access on the LAN |
| Path safety | `safePath` restricts to `rootDir` | Mitigates basic path traversal |
| Tar extraction | Sanitizes `..` in filenames | Reduces zip-slip-style issues |

**Recommendations:**
1. Use only on **trusted local networks** (or isolated tunnels)
2. Do **not** expose the port on routers, WAN, or broad VPNs without additional auth
3. Point `rootDir` only to the directory you actually need to migrate
4. Stop the server as soon as transfers are complete

**Known limitations:**
- No authentication, user authorization, or access audit
- No HTTPS/TLS — plain HTTP only
- TAR implementation is simplified ustar: filenames > 100 chars are truncated
- `get-dir` does **not** support resume (only single-file `get` does)
- No automated tests, CI, or lint scripts
- No rate limiting, size enforcement, or concurrency control
- Windows compatibility has Git Bash path workarounds but no cross-platform test matrix

---

## 📄 License

MIT © [herdeiroeth](https://github.com/herdeiroeth)

---

<p align="center">Made with ❤️ and zero <code>node_modules</code></p>
