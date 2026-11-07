# Development

> Detailed documentation for **LIBPACK**. Overview: [README](../../README.md) · [Tiếng Việt](../vi/development.md) · [简体中文](../zh-CN/development.md).

## Build and test

### Agent

```powershell
cd agent
gofmt -l .        # must print nothing
go vet ./...
go test ./... -v
.\build.ps1       # or: $env:VERSION="0.2.0"; .\build.ps1
```

| Test | Checks |
|---|---|
| `TestLockfileV1` | Nested dependencies tree, `npm:` aliases, skips `file:` |
| `TestLockfileV3` | `packages`, aliases via `name`, skips workspace / link, `direct` flag, license |
| `TestScopedNodeModules` | `@scope/pkg`, metadata (license / author / repository), nested `node_modules`, skips `.bin` |
| `TestGlobal` | Global npm folder, scoped packages |
| `TestSymlinkLoop` | Symlink loops do not hang, links are not followed |
| `TestJunctionAndSymlinkRejected` | `ModeIrregular` (junction) and `ModeSymlink` are rejected |
| `TestSkipDirsAndDepth` | Skips `.git`, `Temp`; respects `max_depth` |
| `TestLargeFileSkipped` | Files > 50 MB are not read |
| `TestDedupe` | Merges lockfile and node_modules records, keeps the `direct` flag |
| `TestInstallScripts` | Picks up `preinstall/install/postinstall` correctly, `hasInstallScript` from the lockfile |
| `TestConfigFromDataDir` | Prefers `config.json` in the data folder; reports an error on broken JSON |
| `TestNoProcessExecutionImports` | **No file imports `os/exec` or `syscall`** |

### UI

```powershell
cd ui
npm install
npm run typecheck     # tsc --noEmit
npm run dev           # development mode, http://127.0.0.1:7788
npm run build         # production build
npm run start
```

**Trying the update feature safely:** do not try it on real projects. Point the UI at a separate sandbox:

```powershell
$env:LIBPACK_DATA_DIR = "C:\temp\lab\data"   # holds a config.json pointing to C:\temp\lab\proj
$env:APPDATA = "C:\temp\lab\appdata"         # fake global npm folder: C:\temp\lab\appdata\npm\node_modules
npx next start -H 127.0.0.1 -p 7790
```

### Adding a language / new string

1. Add the key to the `vi` object in `ui/src/lib/i18n.ts`.
2. Add the same key to `en` and `zh`. If one is missing, `npm run typecheck` reports an error.
3. Use `t("key", { param })` on the server (`getI18n()`) or the client (`useI18n()`).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "pkgscan not found at …" | The agent has not been built. Run `agent\build.ps1`, or set `LIBPACK_AGENT_PATH`. |
| Overview shows 0 projects | The default folders do not contain your projects. Go to **Settings**, add folders, then click **Save & scan now**. |
| `config.json: invalid escape sequence` | `config.json` was edited by hand with single `\`. Use `/` or `\\`, or edit it in the Settings tab. |
| `EADDRINUSE 127.0.0.1:7788` | Another server is already running. Stop it (`Get-CimInstance Win32_Process` → look for `next start`), or use another port: `npx next start -H 127.0.0.1 -p 7799`. |
| Security page says "You rescanned after the last check" | Click **Check again** to sync with the new scan. |
| Vulnerability fix reports **Vulnerability remains** | A parent package pins the old version. Update the parent package (Updates tab), then check again. |
| After an update, a build tool fails (esbuild, sharp…) | Caused by `--ignore-scripts`. If you trust that package: `npm rebuild <name>` in the project folder. |
| Want to undo an update | Copy `package.json` + `package-lock.json` from `%LOCALAPPDATA%\libpack\backups\<timestamp>\…` back into the project, then run `npm install --ignore-scripts`. |
| Cannot reach the registry / OSV | Check the network and proxy. Private registries that require authentication are not supported yet (see [Known limitations](#known-limitations)). |
| `latest.json` is corrupted | The UI treats it as no data. Click **Scan now** to regenerate it. |

## Known limitations

- **npm only.** yarn, pnpm (uses symlinks, so it is skipped) and bun are not scanned. Packages of VS Code or browser extensions are not scanned either.
- **Only the latest scan is kept**; there is no change history.
- **Malware detection relies on a list of known malware** (OSV.dev). A brand-new malicious package that nobody has reported yet will not be detected. Install-script analysis gives only signals and can produce false positives or miss things; for example, malware inside a `.js` file that the script calls is not visible, because the tool does not read source code.
- **The "direct" flag is only available with lockfile v2/v3.** Projects with a v1 lockfile or no lockfile are skipped in the Updates tab.
- **Transitive packages** can only be upgraded within the range the parent package allows (`npm update`).
- **Private registries that require authentication** do not work yet, because the tool does not read `.npmrc`.
- **"Check all for updates"** on the project page checks at most 300 packages at a time.
- **No login**, because the UI listens on `127.0.0.1` only. Switching to `0.0.0.0` would expose the npm-running features to the network — **do not do this**.
- **Cannot be put on the cloud (e.g. Cloudflare) as is.** The app needs to read the disk and run npm on the user's own machine. A central dashboard would require an extra component that sends reports from the agent to a server.
- **The `agent/testdata/` folder** contains test data that is deliberately written to look malicious. If your scan folders include this repo, it will show up in the alerts.
- The macOS and Linux builds **have not been tested on real machines yet**.
