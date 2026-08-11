# Contributing

Contributions should keep `neighbourhood` small, auditable, and explicit about its trust boundary. Correctness and data safety take precedence over preserving a zero-dependency implementation.

## Set up

1. Install Node.js 22 or newer.
2. Fork and clone the repository.
3. Create a focused branch from `master`.
4. Install the locked development environment:

```bash
npm ci
```

There are currently no third-party runtime or development dependencies; the lockfile is retained for deterministic package metadata and future changes.

## Validate a change

Run the same checks used by CI:

```bash
npm run check
npm test
npm pack --dry-run
```

Changes to networking or filesystem behavior should include integration tests. At minimum, consider Linux, macOS, Windows, empty files, interrupted responses, byte-range boundaries, symbolic links, parent traversal, pre-existing output, and stream chunks split at arbitrary byte offsets.

## Pull requests

- Keep each pull request limited to one behavior or maintenance concern.
- Explain user-visible behavior, compatibility, and security implications.
- Add or update tests before documenting a new guarantee.
- Do not commit package archives, partial downloads, logs, credentials, or local tool state.
- Do not change the package version in an ordinary feature or fix pull request; release preparation owns the version.

Conventional commit prefixes such as `fix:`, `feat:`, `docs:`, `test:`, and `chore:` are encouraged because release notes are generated from merged pull requests.

## Security reports

Do not disclose a vulnerability in an issue or pull request. Follow [SECURITY.md](SECURITY.md).
