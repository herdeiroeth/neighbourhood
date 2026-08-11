# trans

> 🚀 **Zero-dependency LAN file transfer tool** — share files between machines on the same network instantly.

![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![No Dependencies](https://img.shields.io/badge/dependencies-0-success)

`trans` is a lightweight, self-contained file transfer tool for local networks. No external dependencies — just Node.js built-in modules. It features resume support, directory downloads (streamed as tar), and a beautiful progress bar.

---

## ✨ Features

- **📂 Browse remote files** — list directories from another machine
- **⬇️ Download files** — single file downloads with progress bar and ETA
- **📁 Download directories** — entire folders streamed as `.tar`
- **⏯️ Resume support** — interrupt and resume downloads without restarting
- **🚫 No dependencies** — pure Node.js, zero `npm install` needed
- **🌐 LAN optimized** — built for local network speed and reliability
- **🖥️ Cross-platform** — works on Windows, macOS, and Linux

---

## 📦 Installation

```bash
# Clone the repo
git clone https://github.com/herdeiroeth/trans.git
cd trans

# Or install globally
npm install -g
```

---

## 🚀 Usage

### 1️⃣ Start the server (on the machine with the files)

```bash
# Share the current directory
npx trans-server

# Share a specific directory on a custom port
npx trans-server /path/to/share --port 8080

# Or using PORT env var
PORT=8080 npx trans-server /path/to/share
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

### 2️⃣ Use the client (on any machine on the same network)

```bash
# List files
npx trans-client 192.168.1.10:3000 list /
npx trans-client 192.168.1.10:3000 list /Documents

# Download a single file
npx trans-client 192.168.1.10:3000 get /photos/vacation.zip

# Download an entire directory (streamed as tar)
npx trans-client 192.168.1.10:3000 get-dir /Documents

# Shorter alias: 'ls' instead of 'list'
npx trans-client 192.168.1.10:3000 ls /
```

---

## 📋 API Endpoints

For advanced use or browser access:

| Endpoint | Method | Query Param | Description |
|---|---|---|---|
| `/api/list` | GET | `path` | List directory contents |
| `/api/stat` | GET | `path` | Get file/directory metadata |
| `/api/download` | GET | `path` | Download a file (supports Range headers) |
| `/api/download-dir` | GET | `path` | Download a directory as TAR archive |

---

## 🔧 How It Works

```
┌─────────────┐         HTTP/REST          ┌─────────────┐
│   Server    │◄──────────────────────────►│   Client    │
│  (sharing)  │   list / get / get-dir     │ (receiving) │
└─────────────┘                            └─────────────┘
     │                                            │
     │  Zero dependencies                        │
     │  Node.js built-in: http, fs, path         │
     │  Resume via Range headers                 │
     │  Directories as TAR streams               │
```

- **Server** is a plain `http.createServer` with 4 REST endpoints
- **Client** is a CLI tool using `http.get` with a real-time progress bar
- **Resume** uses `.part` files + HTTP `Range` headers
- **Directory downloads** create a TAR archive on-the-fly (POSIX tar format)

---

## 🧪 Manual Test

```bash
# Terminal 1: Start the server
npx trans-server

# Terminal 2: List and download
npx trans-client localhost:3000 list /
npx trans-client localhost:3000 get /package.json
npx trans-client localhost:3000 get-dir /lib
```

---

## 🛠️ Development

```bash
# No build step needed! Just edit and run.
node bin/server.js
node bin/client.js localhost:3000 list /
```

---

## 📄 License

MIT © [herdeiroeth](https://github.com/herdeiroeth)

---

<p align="center">Made with ❤️ and zero <code>node_modules</code></p>
