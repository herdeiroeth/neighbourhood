# neighbourhood

[![CI](https://github.com/herdeiroeth/neighbourhood/actions/workflows/ci.yml/badge.svg)](https://github.com/herdeiroeth/neighbourhood/actions/workflows/ci.yml)
[![CodeQL](https://github.com/herdeiroeth/neighbourhood/actions/workflows/codeql.yml/badge.svg)](https://github.com/herdeiroeth/neighbourhood/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

`neighbourhood` is a small command-line tool for transferring files and directories between machines on the same local network. It uses Node.js built-in modules only, supports HTTP byte-range resume for individual files, and streams directories as POSIX ustar archives.

> [!WARNING]
> The server has no authentication or TLS and listens on all interfaces by default. Run it only on a trusted, isolated network. Do not expose its port to the public internet or an untrusted VPN.

The project is currently pre-release. GitHub release archives are automated; npm publication is intentionally disabled until ownership of the `@herdeiroeth` npm scope and a trusted publisher are confirmed.

`master` is the only long-lived branch. Changes enter through pull requests and must pass the required quality gate and CodeQL analysis.

## Capabilities

- List files and directories below an explicit shared root.
- Download individual files with progress, throughput, ETA, and size-based resume.
- Transfer directory trees without staging a complete archive on disk.
- Reject path traversal, out-of-root symbolic links, invalid byte ranges, malformed TAR headers, and unsafe extraction paths.
- Run without runtime dependencies on supported Node.js releases.

## Requirements

- Node.js 22 or newer.
- Direct IP connectivity between the client and server.
- A trusted network boundary; the application does not provide one.

CI covers Node.js 22 and 24 on Linux, macOS, and Windows.

## Install from source

```bash
git clone https://github.com/herdeiroeth/neighbourhood.git
cd neighbourhood
npm ci
npm link
```

This installs two commands locally:

- `neighbourhood-server`
- `neighbourhood-client`

When published, tagged releases contain an installable package archive and its SHA-256 checksum. After verifying the checksum, install an archive with:

```bash
npm install --global ./herdeiroeth-neighbourhood-0.1.0.tgz
```

Replace the filename with the archive attached to the selected release.

## Usage

On the machine that owns the files, share only the required directory:

```bash
neighbourhood-server /path/to/share
```

With the default wildcard bind, the server prints the local address and one detected LAN address. The default port is `3000`.

```text
neighbourhood-server [directory] [--host address] [--port number]
```

Examples:

```bash
# Use a different port
neighbourhood-server /path/to/share --port 8080

# Bind only to the local machine
neighbourhood-server /path/to/share --host 127.0.0.1

# PORT is also supported
PORT=8080 neighbourhood-server /path/to/share
```

On another machine on the same network:

```bash
# List the shared root
neighbourhood-client 192.168.1.10:3000 list /

# List a subdirectory
neighbourhood-client 192.168.1.10:3000 list /Documents

# Download one file into the current directory
neighbourhood-client 192.168.1.10:3000 get /Documents/report.pdf

# Extract a directory tree into the current directory
neighbourhood-client 192.168.1.10:3000 get-dir /Documents
```

Bracketed IPv6 addresses are accepted:

```bash
neighbourhood-client '[fd00::10]:3000' list /
```

The same entrypoints can be run from a checkout without linking:

```bash
npm run server -- /path/to/share
npm run client -- 127.0.0.1:3000 list /
```

## Transfer behavior

### Individual files

An incomplete download is stored as `<filename>.part`. Repeating the same `get` command sends a `Range` request for the remaining bytes. If the server ignores that request and returns the complete file, the client restarts from byte zero instead of appending duplicate content.

The client validates remote metadata, `Content-Range`, and the final byte count before promoting the partial file. Unsafe names and symbolic-link partials are rejected, and an existing destination is never replaced. Resume is based on byte length; it does not currently use content hashes or file-version validators.

### Directories

The server produces a deterministically ordered POSIX ustar stream. The client validates header checksums, entry types, path confinement, padding, and the end marker while extracting it.

- Empty directories and empty files are preserved.
- Symbolic links and special files are not included in directory archives.
- Existing regular files are never overwritten during extraction.
- Directory transfers do not resume after interruption.
- An interrupted directory transfer may leave completed files in place. Inspect and remove only files created by the failed attempt, or retry from a clean destination.

## HTTP API

The CLI uses four read-only endpoints:

| Endpoint | Method | Query | Response |
| --- | --- | --- | --- |
| `/api/list` | `GET` | `path` | Directory entries as JSON |
| `/api/stat` | `GET` | `path` | File or directory metadata as JSON |
| `/api/download` | `GET`, `HEAD` | `path` | File bytes; single byte ranges are supported |
| `/api/download-dir` | `GET`, `HEAD` | `path` | POSIX ustar stream |

The server returns `416 Range Not Satisfiable` for malformed, multiple, reversed, or out-of-bounds ranges. A range ending past EOF is clamped to the file boundary.

## Security model

The shared directory is a security boundary, but the network is assumed to be trusted.

- Requested paths are checked lexically and after canonical filesystem resolution.
- A symbolic link that resolves outside the shared root is rejected; links are omitted from listings and directory archives.
- TAR extraction rejects absolute paths, parent traversal, drive-qualified paths, symbolic-link parents, unsupported entry types, invalid checksums, and duplicate/existing files.
- CORS is not enabled.
- Error responses do not expose filesystem paths.

These controls do not add authentication, confidentiality, peer identity, or protection from a hostile local process that can mutate the shared filesystem during a transfer. See [SECURITY.md](SECURITY.md) for reporting instructions.

## Development

```bash
npm ci
npm run check
npm test
npm run test:coverage
npm pack --dry-run
```

The test suite uses `node:test` and has no third-party test runner. It covers root confinement, symbolic links, empty files, valid and invalid byte ranges, interrupted resume behavior, TAR chunk boundaries, checksums, traversal, truncation, and overwrite protection.

Pull requests should follow [CONTRIBUTING.md](CONTRIBUTING.md). Before creating a release tag, confirm that the full CI matrix has passed on `master`.

## Releases and package distribution

The version in `package.json` is the source of truth. Pushing a matching tag such as `v0.1.0` runs validation and, when successful, creates the npm-compatible `.tgz`, its SHA-256 checksum, and a GitHub Release with generated notes.

The package metadata is prepared as `@herdeiroeth/neighbourhood` with public access. The release workflow does **not** run `npm publish` and stores no registry credential. npm publication should be added only after the scope is confirmed and npm trusted publishing is configured for this repository.

## Limitations

- No authentication, authorization, TLS, service discovery, or peer verification.
- Single-file resume detects byte-count inconsistencies but does not verify content hashes.
- Directory transfers are uncompressed and cannot resume.
- POSIX ustar path and file-size limits apply.
- Symbolic links, devices, sockets, and other special filesystem entries are skipped in listings and directory archives.
- The server is intended for temporary transfers, not permanent file hosting.

## License

[MIT](LICENSE) © Ryan Trunquim.
