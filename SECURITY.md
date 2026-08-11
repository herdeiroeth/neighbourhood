# Security policy

`neighbourhood` reads files from one machine and writes files on another. Root confinement, archive parsing, byte-range handling, and partial-download integrity are security-sensitive code.

## Supported versions

Before the first stable release, security fixes are applied to `master` only. After releases begin, only the latest release line will receive security fixes unless a release note states otherwise.

## Report a vulnerability

Do not open a public issue with exploit details, private paths, credentials, network addresses, or proof-of-concept payloads.

Use GitHub private vulnerability reporting from the repository's **Security** tab when it is available. If that option is unavailable, open an issue containing only a request for a private maintainer contact; do not include technical details until a private channel is established.

A useful private report includes:

- the affected version or commit;
- the operating system and Node.js version;
- the required attacker position and trust assumptions;
- the smallest reproducible payload or filesystem layout;
- the observed impact;
- a proposed mitigation, if known.

## Deployment boundary

The application does not provide authentication, authorization, encryption, or peer verification. Those are documented limitations, not security bugs by themselves. Exposing the server outside a trusted and isolated network is unsupported.

Reports are still in scope when documented boundaries fail, including:

- reading outside the configured shared root;
- writing outside the selected destination;
- following an unsafe symbolic link;
- archive parsing that overwrites an existing file;
- malformed ranges or streams causing data corruption;
- unauthenticated behavior that exceeds what the README explicitly describes.
