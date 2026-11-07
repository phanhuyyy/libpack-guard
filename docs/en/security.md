# Security model

> Detailed documentation for **LIBPACK**. Overview: [README](../../README.md) · [Tiếng Việt](../vi/security.md) · [简体中文](../zh-CN/security.md).

## Who can do what

| Component | Reads | Writes | Runs processes | Network |
|---|---|---|---|---|
| **pkgscan** | Only `package-lock.json` and `node_modules/**/package.json` | Only the libpack data folder | **Never** (a test forbids importing `os/exec`, `syscall`) | **None** |
| **UI server** | `latest-{pm}.json`, `security-{pm}.json`, `config.json`; subfolder names (folder browser) | `config.json`, `security-{pm}.json`, `backups/` | `pkgscan scan`; `npm` **only after the user confirms** | registry.npmjs.org, api.osv.dev, only on click |
| **Browser** | Through the API | `lang`, `theme` cookies | No | Only to `127.0.0.1` |

## Guardrails when running npm

```mermaid
flowchart TD
    Click["User clicks 'Run update'"] --> O1{"Origin = UI and<br/>Host is loopback?"}
    O1 -- No --> X1["403"]
    O1 -- Yes --> O2{"Record present in<br/>latest-{pm}.json?"}
    O2 -- No --> X2["Refuse"]
    O2 -- Yes --> O3{"Current package<br/>is malware?"}
    O3 -- Yes --> X3["Refuse: remove it"]
    O3 -- No --> O4{"Valid target version?<br/>(fix from OSV / suggestion from registry)"}
    O4 -- No --> X4["Refuse"]
    O4 -- Yes --> O5{"Another update running?"}
    O5 -- Yes --> X5["Wait"]
    O5 -- No --> Bk["Back up package.json + lockfile"]
    Bk --> Run["node npm-cli.js … --ignore-scripts<br/>execFile, no shell, 10-minute timeout"]
    Run --> Re["Rescan + re-check OSV"]
    Re --> Res["Report result + log"]
```

| Risk | Mitigation |
|---|---|
| Malicious install script runs automatically | Always `--ignore-scripts` and `npm_config_ignore_scripts=true` |
| Command injection via package name or path | No shell: `execFile(node, [npm-cli.js, ...args])`. Package names and versions must match a strict regex. The server builds the command. |
| Another website calls the local API | `Origin` must match `Host`, and `Host` must be `127.0.0.1` / `localhost` / `[::1]` (blocks DNS rebinding) |
| Installing a malicious version by mistake | The target must be the version proposed by the plan (registry re-read) and confirmed by OSV as not malware; if the check cannot be done, nothing runs |
| Breaking a project | `package.json` + lockfile are backed up to `backups/<timestamp>/…` before running |
| Two npm commands running at once | Lock: one update at a time |
| Junction / symlink loops | `isPlainDir()` skips `ModeSymlink` and `ModeIrregular`; a test covers symlink loops |
| Huge files causing a hang | Files > 50 MB are skipped |
| Leaking information in OSV lookups | Only name + version are sent |
| Someone on the LAN opening the UI | The server listens on `127.0.0.1` only |

## See also

- [Security checks](workflows.md#5-security-checks): install-script analysis and OSV.dev lookup
- [One-click vulnerability fix](workflows.md#6-one-click-vulnerability-fix)
- [Planning and updating outdated packages](workflows.md#7-planning-and-updating-outdated-packages)
