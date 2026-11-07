# Workflows

> Detailed documentation for **LIBPACK**. Overview: [README](../../README.md) · [Tiếng Việt](../vi/workflows.md) · [简体中文](../zh-CN/workflows.md).

## Screens and navigation

| Tab / page | Path | Main features |
|---|---|---|
| **Overview** | `/` | Security banner, stats (package installs, unique packages, projects, global installs), list of projects and global folders, **Rescan** button. |
| **Project details** | `/project?root=…` | Direct or all packages, filter by name, **"Check all for updates"** button (up to 300 packages), "Outdated only" filter. |
| **Search** | `/packages?q=&v=&exact=` | Search by name (partial or exact match), filter by version. Results: package, version, type, folder, source file. |
| **Package details** | `/package?name=…` | Description, license, author, npm / homepage / repo links, security alerts, **"Check for updates"** button, list of install locations. |
| **Updates** | `/updates` | Plans updates across every project. **Update** button on each row, or copy the commands / download a `.ps1` / `.sh` script. |
| **Security** | `/security` | Malicious packages, suspicious install scripts, published vulnerabilities (with an **Update** button per row), other packages with install scripts. |
| **Settings** | `/settings` | Pick scan folders with the folder browser, adjust the depth, **Save** / **Save & scan now**. |

The **top bar** has the **VI · EN · 中** language switcher and the ☀ / ☾ / 🖥 theme switcher.

```mermaid
flowchart LR
    Home["Overview /"] --> Project["Project details /project"]
    Home --> Search["Search /packages"]
    Search --> Pkg["Package details /package"]
    Project --> Pkg
    Home -- "banner" --> Sec["Security /security"]
    Sec --> Pkg
    Sec -- "Update button" --> FixDlg["Vulnerability fix dialog"]
    Upd["Updates /updates"] -- "Update button" --> UpgDlg["Update dialog"]
    Upd --> Script["Download .ps1 / .sh"]
    Home -- "Change" --> Set["Settings /settings"]
    Set --> Picker["Folder browser"]
```

## 1. Package scanning (pkgscan)

When you click **Rescan** (or **Save & scan now**), the server calls `POST /api/scan`. This route runs the `pkgscan scan` binary only: fixed path, fixed arguments, no shell, and only one scan at a time.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant B as Browser
    participant S as Next.js /api/scan
    participant A as pkgscan
    participant D as Data folder

    U->>B: Click "Rescan"
    B->>S: POST /api/scan (Origin = the UI itself)
    S->>S: Check Origin + Host is loopback
    S->>A: execFile(pkgscan, ["scan"]) — no shell
    A->>A: Read config.json (data folder → next to exe → defaults)
    A->>A: Scan the global npm folder
    A->>A: Walk the root folders (see diagram below)
    A->>A: Dedupe on name + version + project_root
    A->>D: Write latest-{pm}.json (write temp file, then rename)
    A-->>S: "Scanned N packages"
    S-->>B: { ok: true }
    B->>B: router.refresh() — page re-reads latest-{pm}.json
```

**How pkgscan walks folders:**

```mermaid
flowchart TD
    Start(["Root folder"]) --> IsDir{"Real folder?<br/>not a symlink / junction"}
    IsDir -- No --> Skip(["Skip"])
    IsDir -- Yes --> Lock{"Has package-lock.json<br/>≤ 50 MB?"}
    Lock -- Yes --> ParseLock["Read lockfile v1/v2/v3"]
    Lock -- No --> Children
    ParseLock --> Children["List subfolders<br/>(real folders only)"]
    Children --> Each{"Subfolder name"}
    Each -- "node_modules" --> NM["Read node_modules<br/>(see section 2)"]
    Each -- ".git, Temp, tmp, AppData,<br/>$Recycle.Bin, .cache, .Trash" --> Skip
    Each -- "other" --> Depth{"Depth < max_depth?"}
    Depth -- Yes --> Start
    Depth -- No --> Skip
```

**Safety limits while walking:**

| Limit | Value | Location in code |
|---|---|---|
| Default folder depth | 8 (adjustable from 1–20) | `agent/config.go` |
| Nested `node_modules` depth | 12 | `agent/nodemodules.go` |
| Maximum file size | 50 MB | `agent/walk.go` |
| Symlink / junction / mount point | Always skipped | `isPlainDir()` in `agent/walk.go` |
| Stored install-script length | 2,000 characters | `agent/nodemodules.go` |

## 2. Reading lockfiles and node_modules

```mermaid
flowchart TD
    subgraph LF["package-lock.json"]
        V{"lockfileVersion"}
        V -- "2 / 3: has 'packages'" --> P["Walk 'node_modules/…' keys<br/>• skip '' (the project itself)<br/>• skip link: true entries (workspace)<br/>• alias name taken from the 'name' field<br/>• direct = listed in the root's dependencies/<br/>devDependencies<br/>• read license, hasInstallScript"]
        V -- "1: only 'dependencies'" --> D1["Recurse the dependencies tree<br/>• alias 'npm:name@ver'<br/>• skip 'file:'"]
    end

    subgraph NM["node_modules"]
        L["List subfolders"] --> Sc{"Name starts with"}
        Sc -- "'.'" --> X(["Skip (.bin, .cache…)"])
        Sc -- "'@'" --> Scope["@scope/name/package.json"]
        Sc -- "other" --> Plain["name/package.json"]
        Scope --> Read["Read name, version, description,<br/>license, author, homepage, repository,<br/>scripts.preinstall/install/postinstall"]
        Plain --> Read
        Read --> Nested{"Nested node_modules?"}
        Nested -- Yes --> L
    end

    P --> Merge
    D1 --> Merge
    Read --> Merge["Merge + dedupe<br/>(name, version, project_root)"]
    Merge --> Rule["The node_modules record wins<br/>(proves it is installed, has metadata)<br/>but keeps the direct flag from the lockfile"]
    Rule --> Out[("latest-{pm}.json")]
```

Each record has a `scope`:
- `project`: belongs to a project; `project_root` is the folder that contains the lockfile or the top-level `node_modules`.
- `global`: belongs to the global npm folder:
  - Windows: `%AppData%\npm\node_modules`
  - macOS / Linux: `/usr/local/lib/node_modules`, `~/.npm-global/lib/node_modules`

## 3. Configuring scan folders

```mermaid
flowchart LR
    subgraph Settings["Settings tab"]
        Add["Add folder"] --> Picker["Folder browser<br/>POST /api/fs"]
        Picker --> List["Folder list"]
        Depth["Depth slider 1–20"]
        List --> Save["Save / Save & scan now<br/>POST /api/config"]
        Depth --> Save
    end
    Save --> Validate{"Server checks:<br/>• absolute path<br/>• exists and is a folder<br/>• merge duplicates<br/>• 1–50 folders, depth 1–20"}
    Validate -- "valid" --> W[("%LOCALAPPDATA%\libpack\config.json")]
    Validate -- "error" --> Err["Show translated error"]
```

**Order in which the agent looks for configuration** (the first file that exists is used):

1. `<data folder>/config.json`: written by the UI.
2. `config.json` next to the `pkgscan` binary: handy when using the command line on its own.
3. Defaults:
   - Windows: `~\source`, `~\Documents`, `~\code`, `~\projects`, `~\repos`, `~\Desktop`
   - macOS / Linux: `~/code`, `~/projects`, `~/src`, `~/dev`, `~/repos`, `~/Documents`, `~/Desktop`

The folder browser **only lists subfolder names**; it never reads file contents. It hides symlinks, junctions and system folders, and marks any folder that has a `package.json` or `node_modules` as a **"Node project"**.

## 4. Checking for new versions

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant R as /api/registry
    participant N as registry.npmjs.org

    B->>R: GET ?name=lodash&versions=4.17.15
    R->>R: Validate the package name
    alt not in cache (30 minutes)
        R->>N: GET /lodash<br/>Accept: application/vnd.npm.install-v1+json
        N-->>R: abbreviated metadata
    end
    R->>R: latest, deprecated, missing,<br/>inMajor = newest stable release in the same major<br/>(0.x: same minor too)
    R-->>B: RegistryInfo
    B->>B: Compare semver → Up to date / Patch, Minor or Major behind / Ahead of latest
```

The UI uses this on the package details page, the project page ("Check all for updates", 6 parallel requests) and the Updates tab.

## 5. Security checks

The Security tab combines two sources: **offline analysis** of install scripts, and an **online lookup** against OSV.dev.

```mermaid
flowchart TB
    subgraph Offline["Offline — always runs"]
        S1["install_scripts in latest-{pm}.json"] --> H["Heuristic rules"]
        H --> Lv{"Level"}
        Lv -- "pipe into a shell, touches .npmrc/.ssh/token,<br/>webhook / pastebin / ngrok,<br/>reverse shell" --> Crit["Highly suspicious"]
        Lv -- "curl/wget/iwr, invokes PowerShell/shell,<br/>node -e / eval, base64 / obfuscation,<br/>URL / IP, runs hidden" --> High["Suspicious"]
        Lv -- "no rule matched" --> Info["Has install script"]
    end

    subgraph Online["Online — when you click 'Check with OSV.dev'"]
        Q["POST /v1/querybatch<br/>(≤1000 name@version per batch)"] --> Ids["List of advisory IDs"]
        Ids --> Det["GET /v1/vulns/{id}<br/>(8 parallel requests)"]
        Det --> Cls{"Classify"}
        Cls -- "id or alias is MAL-*<br/>or CWE-506" --> Mal["Malware"]
        Cls -- "everything else" --> Vul["Vulnerability<br/>(severity from GHSA)"]
        Mal --> SJ[("security-{pm}.json")]
        Vul --> SJ
    end

    Crit --> Page["Security page + Overview banner"]
    High --> Page
    Info --> Page
    SJ --> Page
```

**What is sent out:** only **package names and versions** — no paths, machine name or file contents.

**Why not detect malware by keyword?** When tested on real data, searching descriptions for the word "malicious" flagged ordinary vulnerabilities, e.g. *"a malicious package could…"* in the `pnpm` and `tar` advisories. So the tool relies only on **structured data**: OpenSSF `MAL-*` IDs and GitHub's `CWE-506` ("Embedded Malicious Code").

**When malware is found**, the page shows a red box with 4 steps:
1. Do not run `npm install` / `npm run` in the affected folders.
2. Delete `node_modules` and remove the package.
3. Change passwords, revoke npm / GitHub / cloud tokens and SSH keys.
4. Report it to IT.

## 6. One-click vulnerability fix

Each row in the **Published vulnerabilities** table has an **Update** button. The browser **only says which package in which folder**; the server builds the npm command itself.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant B as Dialog
    participant F as /api/fix
    participant P as updater.ts
    participant N as npm (node npm-cli.js)
    participant A as pkgscan
    participant O as OSV.dev

    U->>B: Click "Update"
    B->>F: POST { root, name, version, mode: "plan" }
    F->>P: planAction()
    P->>P: In latest-{pm}.json? Not malware?
    P->>P: Fixed version = nearest fix of each advisory,<br/>take the highest of those
    P->>P: Choose the action (table below)
    P-->>B: Description + exact command
    U->>B: Click "Run update"
    B->>F: POST { ..., mode: "apply" }
    F->>P: applyAction() — plan recomputed on the server
    P->>P: Lock: one update at a time
    P->>P: Back up package.json + lockfile (project)
    P->>N: execFile(node, [npm-cli.js, ...args]) — no shell
    N-->>P: exit code + log
    P->>A: Rescan
    P->>O: Re-check everything
    P-->>B: Fixed / Partially fixed / Vulnerability remains + log + backup
```

**The server chooses the action:**

```mermaid
flowchart TD
    R["Record in latest-{pm}.json"] --> G{"scope"}
    G -- global --> Top{"Top level?"}
    Top -- Yes --> A1["npm install -g --prefix P<br/>--ignore-scripts name@fixed"]
    Top -- "No (inside another package)" --> A2["npm install -g --prefix P<br/>--ignore-scripts parent@latest"]
    G -- project --> Dir{"direct?"}
    Dir -- Yes --> A3["npm install --ignore-scripts<br/>name@fixed"]
    Dir -- No --> A4["npm update --ignore-scripts name<br/>(within the range the parent allows)"]
```

| Result | Meaning |
|---|---|
| ✅ **Fixed** | Every install of the package in that folder is ≥ the fixed version. |
| ⚠️ **Partially fixed** | Some installs were upgraded, some are still old (several nested copies). |
| ❌ **Vulnerability remains** | npm finished, but a parent package pins the old version (e.g. `express@4.17.1` pins `qs@6.7.0`). The parent package needs updating. |

> Example of how the fixed version is chosen: `protobufjs@7.5.4` has fixes in 6.11.6, 7.5.5 and 8.0.1. The tool picks **7.5.5** (the nearest), not 8.0.1.

## 7. Planning and updating outdated packages

The **Updates** tab looks at the **direct packages** of every project and the **top-level global packages**. Transitive packages are controlled by their parent, so they are not listed here.

```mermaid
flowchart TD
    Start["Click 'Check & build plan'"] --> Fetch["Query the registry for each name<br/>(6 in parallel)"]
    Fetch --> Row["For each direct / top-level global package"]
    Row --> Minor["minor = newest release in the same major<br/>(0.x: same minor, skip prerelease, deprecated)"]
    Row --> Major["major = latest if the major differs"]
    Minor --> Def{"Default selection"}
    Major --> Def
    Def -- "has minor" --> SelMinor["Select minor ✓"]
    Def -- "major only" --> SelNone["Not selected — 'Only a new major is available'"]
    Row --> MalChk{"Malware<br/>according to security-{pm}.json?"}
    MalChk -- Yes --> Block["Removed from the plan<br/>'remove it, do not update'"]
    SelMinor --> Out
    SelNone --> Out
    Out{"How to apply"}
    Out -- "Update button per row" --> One["Confirmation dialog → runs now"]
    Out -- "Copy commands / download script" --> Script["Commands per folder<br/>or .ps1 / .sh for all"]
```

**The Update button on each row:** uses the same guardrails as [section 6](#6-one-click-vulnerability-fix), plus two extra checks because the target version is chosen by the user:

```mermaid
sequenceDiagram
    autonumber
    participant B as Dialog
    participant P as planUpgrade()
    participant N as registry
    participant O as OSV /v1/query

    B->>P: { root, name, version, target }
    P->>P: Direct package or top-level global package?
    P->>N: Re-read metadata (bypass cache)
    P->>P: target must be the newest release in the same major<br/>or latest, and > the installed version
    P->>O: Is name@target flagged as malware?
    alt OSV reports malware, or cannot be reached
        P-->>B: Refused, nothing runs
    else safe
        P-->>B: Command: npm install [--g --prefix] --ignore-scripts name@target
    end
```

**Downloaded scripts** (e.g. `.ps1`): every path and package name is wrapped in single quotes using correct PowerShell / sh syntax, a failing folder does not stop the remaining folders, and the failed folders are listed at the end.

```powershell
# libpack update plan - generated 2026-11-07T…
# Review before running. --ignore-scripts: package install scripts will NOT run.
$failed = @()

Write-Host '==> C:\Users\me\proj' -ForegroundColor Cyan
Push-Location -LiteralPath 'C:\Users\me\proj'
npm.cmd install --ignore-scripts 'express@4.22.3' 'lodash@4.18.1'
if ($LASTEXITCODE -ne 0) { $failed += 'C:\Users\me\proj' }
Pop-Location

if ($failed.Count) { Write-Warning ("Failed: " + ($failed -join ", ")) } else { Write-Host "Done." -ForegroundColor Green }
```

## 8. Language and theme

```mermaid
flowchart LR
    Req["Page request"] --> Ck{"Cookie 'lang'?"}
    Ck -- "vi / en / zh" --> Loc["Use that language"]
    Ck -- "missing" --> AL["From Accept-Language<br/>(vi → zh → en → default vi)"]
    AL --> Loc
    Loc --> SSR["Server renders with the dictionary<br/>lib/i18n.ts"]
    Req --> Th{"Cookie 'theme'?"}
    Th -- "light / dark" --> Attr["html data-theme=…"]
    Th -- "system / missing" --> Media["CSS prefers-color-scheme"]
    Attr --> SSR
    Media --> SSR
    SSR --> Page["HTML in the right language and theme from the start<br/>(no flash)"]
```

- The dictionaries live in `ui/src/lib/i18n.ts`. The `MessageKey` type is derived from the Vietnamese dictionary, so **a key missing from en or zh is a TypeScript error at build time**.
- Errors returned by the API are translated as well (`I18nError` → `errorMessage()`).
- Dates and numbers are formatted with `vi-VN`, `en-US`, `zh-CN`. Chinese text uses system fonts (Microsoft YaHei, PingFang SC, Noto Sans SC).
