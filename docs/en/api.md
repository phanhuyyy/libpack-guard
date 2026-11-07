# API and command line

> Detailed documentation for **LIBPACK**. Overview: [README](../../README.md) · [Tiếng Việt](../vi/api.md) · [简体中文](../zh-CN/api.md).

## Internal API

Every API serves only the UI on this same machine. APIs with side effects (POST) all require `Origin` to match `Host`, and `Host` must be loopback.

| Method | Path | Body / Query | Returns | Side effects |
|---|---|---|---|---|
| `POST` | `/api/scan` | — | `{ ok, message }` | Runs `pkgscan scan` |
| `GET` | `/api/registry` | `?name=&versions=a,b` | `RegistryInfo` (`latest`, `inMajor`, `deprecated`, `missing`…) | Calls the registry (30-minute cache) |
| `POST` | `/api/security` | — | `{ ok, malware, vulns }` | Calls OSV, writes `security-{pm}.json` |
| `POST` | `/api/fs` | `{ path? }` | `{ shortcuts }` or `{ path, parent, dirs[] }` | Lists folder names only |
| `POST` | `/api/config` | `{ roots[], max_depth }` | `{ ok, config }` | Writes `config.json` |
| `POST` | `/api/fix` | `{ root, name, version, mode: "plan" \| "apply", target? }` | `plan`: `{ action }` · `apply`: `{ status, after[], log, backup, action }` | `apply`: **runs npm**, backs up, rescans, re-checks OSV |
| `POST` | `/api/uninstall` | `{ root, name, version, mode: "plan" \| "apply" }` | `plan`: `{ action }` · `apply`: `{ status: "removed" \| "stillPresent", after[], log, backup, action }` | `apply`: **runs `npm uninstall`** (direct or top-level global only), backs up, rescans, re-checks OSV |

Without `target`, `/api/fix` is a **vulnerability fix** (the server picks the fixed version). With `target`, it is an **upgrade** from the Updates tab (the server verifies `target`).

## pkgscan command line

```text
pkgscan scan [--manager npm|pnpm]            Scan and save (default: both, one file each)
pkgscan scan --manager npm|pnpm --dry-run    Scan one package manager and print JSON, without saving
pkgscan find <name> [--version <version>] [--manager npm|pnpm]
                                             Find a package in the latest scan results
pkgscan version
```

Examples on Windows:

```powershell
agent\dist\pkgscan-windows-amd64.exe scan --dry-run > scan.json
agent\dist\pkgscan-windows-amd64.exe scan
agent\dist\pkgscan-windows-amd64.exe find axios --version 1.7.4
```

```text
NAME   VERSION    SCOPE    PROJECT
axios  1.7.4      project  C:\Users\me\projects\web

1 result(s) (scan 2026-11-07T04:38:26Z)
```

> `pkgscan` currently prints its help and output in Vietnamese; the text above is translated for readability.
