# neighbourhood

> 🏘️ **依存関係ゼロのLANファイル転送ツール** — 同じネットワーク上のマシン間で瞬時にファイルを共有。

[![zh](https://img.shields.io/badge/lang-zh--CN-blue.svg)](README.md) [![en](https://img.shields.io/badge/lang-en-red.svg)](README.en.md) [![ja](https://img.shields.io/badge/lang-ja-green.svg)](README.ja.md) [![ko](https://img.shields.io/badge/lang-ko-orange.svg)](README.ko.md) [![es](https://img.shields.io/badge/lang-es-purple.svg)](README.es.md)

![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![No Dependencies](https://img.shields.io/badge/dependencies-0-success)

`neighbourhood` は、軽量で自己完結型のLANファイル転送ツールです。外部依存関係は一切不要 — Node.js 標準モジュールのみ使用。中断再開機能、ディレクトリダウンロード（tarストリーミング）、美しいプログレスバーをサポートしています。

**⚠️ セキュリティ注意：** `neighbourhood` には **認証やTLSはありません** — 信頼できるネットワークでのみ使用してください。デフォルトは `0.0.0.0`（全インターフェース）でリッスンし、CORSも全開です。迅速なLAN移行のために設計されており、公衆公開には適していません。

---

## ✨ 機能

- **📂 リモートファイルの閲覧** — 別のマシンからディレクトリ内容を一覧表示
- **⬇️ ファイルのダウンロード** — プログレスバー、速度、予定時刻を表示
- **📁 ディレクトリのダウンロード** — フォルダ全体を `.tar` としてストリーミング
- **⏯️ 中断再開** — HTTP Range ヘッダーによるダウンロード再開
- **🚫 依存関係ゼロ** — 純粋な Node.js 標準ライブラリ（`http`、`fs`、`path`、`os`、`stream`）
- **🌐 LAN最適化** — ローカルネットワークの速度と信頼性に最適化
- **🖥️ クロスプラットフォーム** — Windows、macOS、Linux に対応

---

## 📦 クイックスタート

```bash
# npm install 不要！クローンしてすぐ実行。

# リポジトリをクローン
git clone https://github.com/herdeiroeth/neighbourhood.git
cd neighbourhood

# ターミナル 1：サーバー起動（カレントディレクトリを共有）
node bin/server.js

# ターミナル 2：ファイルを一覧表示＆ダウンロード
node bin/client.js localhost:3000 list /
node bin/client.js localhost:3000 get /package.json
node bin/client.js localhost:3000 get-dir /lib
```

---

## 🚀 使い方

### サーバー側（ファイルがあるマシン）

```bash
# デフォルトポート（3000）でカレントディレクトリを共有
node bin/server.js

# 特定のディレクトリをカスタムポートで共有
node bin/server.js /path/to/share --port 8080

# または PORT 環境変数を使用
PORT=8080 node bin/server.js /path/to/share
```

**出力例：**
```
  trans-server running
  Root: /Users/me/shared-files
  Local: http://localhost:3000
  LAN:   http://192.168.1.10:3000

  On the other machine run:
    node bin/client.js 192.168.1.10:3000 list /
```

### クライアント側（LAN内の任意のマシン）

```bash
# ファイル一覧表示（ls は list のエイリアス）
node bin/client.js 192.168.1.10:3000 list /
node bin/client.js 192.168.1.10:3000 ls /Documents

# 単一ファイルのダウンロード
node bin/client.js 192.168.1.10:3000 get /photos/vacation.zip

# ディレクトリ全体をダウンロード（tar ストリーミング）
node bin/client.js 192.168.1.10:3000 get-dir /Documents
```

中断されたダウンロードは `.part` ファイルとして残ります — 同じ `get` コマンドを再実行すると、HTTP Range ヘッダーで自動的に再開されます。

---

## 📋 API エンドポイント

高度な使用やブラウザアクセス向け：

| エンドポイント | メソッド | クエリパラメータ | 説明 |
|---|---|---|---|
| `/api/list` | GET | `path` | ディレクトリ内容をJSONで一覧表示 |
| `/api/stat` | GET | `path` | ファイル/ディレクトリのメタデータ取得 |
| `/api/download` | GET | `path` | ファイルダウンロード（Range/206 再開対応） |
| `/api/download-dir` | GET | `path` | ディレクトリをTAR形式でダウンロード |

---

## 🔧 アーキテクチャ

```
[マシン A - 送信元]                     [マシン B - 受信先]
  trans-server                              trans-client
  rootDir ──► HTTP :3000 ── LAN ──► list / get / get-dir
              /api/list
              /api/stat
              /api/download      (ファイル, Range)
              /api/download-dir  (tar ストリーム)
```

### プロジェクト構造

```
.
├── bin/
│   ├── server.js          # サーバー CLI エントリーポイント
│   └── client.js          # クライアント CLI エントリーポイント
├── lib/
│   ├── client/
│   │   ├── index.js       # 引数解析とコマンド振り分け
│   │   ├── commands.js    # list / get / get-dir の実装
│   │   ├── progress.js    # 速度とETA付きプログレスバー
│   │   └── resume.js      # .part ファイル管理と Range ヘッダー
│   ├── server/
│   │   ├── index.js       # HTTP サーバー + グレースフルシャットダウン
│   │   ├── routes.js      # API ルートハンドラ（パス安全対策付き）
│   │   └── tar-stream.js  # ストリーミング TAR ジェネレーター（ustar形式）
│   └── shared/
│       ├── protocol.js    # ポートとエンドポイント定数
│       └── format.js      # サイズ、速度、日付のフォーマッター
├── package.json
├── README.md
├── README.en.md
├── README.ja.md
├── README.ko.md
├── README.es.md
├── LICENSE
└── .gitignore
```

| レイヤー | パス | 役割 |
|---|---|---|
| CLI | `bin/` | 実行可能エントリーポイント |
| サーバー | `lib/server/` | HTTP、ルーティング、TAR生成 |
| クライアント | `lib/client/` | コマンド、進捗、再開ロジック |
| 共有 | `lib/shared/` | プロトコル定数、フォーマットユーティリティ |

**技術スタック：**
- **ランタイム：** Node.js ≥ 18（ES modules）
- **依存関係：** ゼロ（標準ライブラリのみ）
- **プロトコル：** プレーン HTTP/1.x（TLSなし）

---

## 🧪 手動テスト

1. テスト用ディレクトリを指定してサーバーを起動
2. `list /` — 名前、タイプ、サイズを確認
3. 小さなファイルを `get`、次に大きなファイルを `get` — 中断 + 再開をテスト
4. `get-dir` — ローカル展開結果を確認
5. `../` パストラバーサルを試行 — 403 Forbidden が返ることを確認
6. サーバー側で Ctrl+C — グレースフルシャットダウンメッセージを確認

---

## ⚠️ セキュリティと制限事項

このツールはLAN移行のために**意図的に緩い権限設定**になっています：

| 項目 | 現在の動作 | リスク |
|---|---|---|
| 認証 | なし | ポートに到達できるすべてのマシンが一覧表示とダウンロード可能 |
| TLS | なし | ネットワーク上のトラフィックは平文 |
| バインド | `0.0.0.0` | 全インターフェースで待ち受け |
| CORS | `Access-Control-Allow-Origin: *` | LAN上のブラウザアクセスを許可 |
| パス安全性 | `safePath` が `rootDir` 内に制限 | 基本的なパストラバーサルを防御 |
| Tar展開 | ファイル名の `..` を除去 | zip-slip 系の問題を軽減 |

**使用上の推奨事項：**
1. **信頼できるローカルネットワーク**でのみ使用（または隔離されたトンネル）
2. 追加の認証なしにルーター、WAN、オープンVPNでポートを公開**しないでください**
3. `rootDir` は実際に移行が必要なディレクトリのみを指定
4. 転送完了後はすぐにサーバーを停止

**既知の制限事項：**
- 認証、ユーザー認可、アクセス監査なし
- HTTPS/TLSなし — 平文HTTPのみ
- TAR実装は簡略化されたustar：100文字を超えるファイル名は切り捨て
- `get-dir` は再開**非対応**（単一ファイルの `get` のみ対応）
- 自動テスト、CI、lintスクリプトなし
- レート制限、サイズ制限、同時実行制御なし
- Windows互換性はGit Bashのパス処理に対応しているが、クロスプラットフォームテストマトリックスなし

---

## 📄 ライセンス

MIT © [herdeiroeth](https://github.com/herdeiroeth)

---

<p align="center">心 ❤️ とゼロの <code>node_modules</code> で作られました</p>
