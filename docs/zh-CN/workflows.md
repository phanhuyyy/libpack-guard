# 工作流程

> **LIBPACK** 详细文档。概览：[README](../../README.zh-CN.md) · [English](../en/workflows.md) · [Tiếng Việt](../vi/workflows.md)。

## 页面与导航

| 标签页 / 页面 | 路径 | 主要功能 |
|---|---|---|
| **概览** | `/` | 安全横幅、统计数据（包安装数、不同的包、项目、全局安装）、项目与全局目录列表、**重新扫描** 按钮。 |
| **项目详情** | `/project?root=…` | 直接依赖或全部包、按名称筛选、**“全部检查更新”** 按钮（最多 300 个包）、“仅显示过期”筛选。 |
| **搜索** | `/packages?q=&v=&exact=` | 按名称搜索（部分或精确匹配），按版本筛选。结果：包、版本、类型、目录、来源文件。 |
| **包详情** | `/package?name=…` | 描述、许可证、作者、npm / 主页 / 仓库链接、安全警报、**“检查更新”** 按钮、安装位置列表。 |
| **更新** | `/updates` | 为所有项目制定更新计划。每一行都有 **更新** 按钮，也可以复制命令或下载 `.ps1` / `.sh` 脚本。 |
| **安全** | `/security` | 恶意包、可疑安装脚本、已公开的漏洞（每行有 **更新** 按钮）、其他带安装脚本的包。 |
| **设置** | `/settings` | 用目录浏览器选择扫描目录、调整深度、**保存** / **保存并立即扫描**。 |

**顶部栏** 有语言选择器 **VI · EN · 中** 和主题选择器 ☀ / ☾ / 🖥。

```mermaid
flowchart LR
    Home["概览 /"] --> Project["项目详情 /project"]
    Home --> Search["搜索 /packages"]
    Search --> Pkg["包详情 /package"]
    Project --> Pkg
    Home -- "横幅" --> Sec["安全 /security"]
    Sec --> Pkg
    Sec -- "更新按钮" --> FixDlg["漏洞修复对话框"]
    Upd["更新 /updates"] -- "更新按钮" --> UpgDlg["更新对话框"]
    Upd --> Script["下载 .ps1 / .sh"]
    Home -- "更改" --> Set["设置 /settings"]
    Set --> Picker["目录浏览器"]
```

## 1. 使用 pkgscan 扫描包

点击 **重新扫描**（或 **保存并立即扫描**）时，服务器调用 `POST /api/scan`。该路由只运行 `pkgscan scan` 这一个可执行文件：路径固定、参数固定、不经过 shell，并且同一时间只允许一次扫描。

```mermaid
sequenceDiagram
    autonumber
    actor U as 用户
    participant B as 浏览器
    participant S as Next.js /api/scan
    participant A as pkgscan
    participant D as 数据目录

    U->>B: 点击“重新扫描”
    B->>S: POST /api/scan (Origin = 界面自身)
    S->>S: 检查 Origin + Host 是否为 loopback
    S->>A: execFile(pkgscan, ["scan"]) — 不经过 shell
    A->>A: 读取 config.json (数据目录 → exe 旁 → 默认)
    A->>A: 扫描全局 npm 目录
    A->>A: 遍历各根目录 (见下图)
    A->>A: 按 name + version + project_root 去重
    A->>D: 写入 latest.json (先写临时文件再重命名)
    A-->>S: "已扫描 N 个包"
    S-->>B: { ok: true }
    B->>B: router.refresh() — 页面重新读取 latest.json
```

**pkgscan 如何遍历目录：**

```mermaid
flowchart TD
    Start(["根目录"]) --> IsDir{"真实目录？<br/>非 symlink / junction"}
    IsDir -- 否 --> Skip(["跳过"])
    IsDir -- 是 --> Lock{"有 package-lock.json<br/>且 ≤ 50 MB？"}
    Lock -- 是 --> ParseLock["读取 lockfile v1/v2/v3"]
    Lock -- 否 --> Children
    ParseLock --> Children["列出子目录<br/>（仅真实目录）"]
    Children --> Each{"子目录名称"}
    Each -- "node_modules" --> NM["读取 node_modules<br/>（见第 2 节）"]
    Each -- ".git, Temp, tmp, AppData,<br/>$Recycle.Bin, .cache, .Trash" --> Skip
    Each -- "其他" --> Depth{"深度 < max_depth？"}
    Depth -- 是 --> Start
    Depth -- 否 --> Skip
```

**遍历时的安全限制：**

| 限制 | 值 | 代码位置 |
|---|---|---|
| 默认目录深度 | 8（可在 1–20 之间调整） | `agent/config.go` |
| 嵌套 `node_modules` 深度 | 12 | `agent/nodemodules.go` |
| 最大文件大小 | 50 MB | `agent/walk.go` |
| Symlink / junction / 挂载点 | 始终跳过 | `agent/walk.go` 中的 `isPlainDir()` |
| 保存的安装脚本长度 | 2,000 个字符 | `agent/nodemodules.go` |

## 2. 读取 lockfile 和 node_modules

```mermaid
flowchart TD
    subgraph LF["package-lock.json"]
        V{"lockfileVersion"}
        V -- "2 / 3：有 'packages'" --> P["遍历 'node_modules/…' 键<br/>• 跳过 ''（项目本身）<br/>• 跳过 link: true 条目（workspace）<br/>• 别名取自 'name' 字段<br/>• direct = 出现在根的 dependencies/<br/>devDependencies 中<br/>• 读取 license、hasInstallScript"]
        V -- "1：只有 'dependencies'" --> D1["递归遍历 dependencies 树<br/>• 别名 'npm:名称@版本'<br/>• 跳过 'file:'"]
    end

    subgraph NM["node_modules"]
        L["列出子目录"] --> Sc{"名称开头为"}
        Sc -- "'.'" --> X(["跳过（.bin、.cache…）"])
        Sc -- "'@'" --> Scope["@scope/名称/package.json"]
        Sc -- "其他" --> Plain["名称/package.json"]
        Scope --> Read["读取 name、version、description、<br/>license、author、homepage、repository、<br/>scripts.preinstall/install/postinstall"]
        Plain --> Read
        Read --> Nested{"有嵌套的 node_modules？"}
        Nested -- 是 --> L
    end

    P --> Merge
    D1 --> Merge
    Read --> Merge["合并 + 去重<br/>（name, version, project_root）"]
    Merge --> Rule["以 node_modules 的记录为准<br/>（证明已安装，且有元数据）<br/>但保留 lockfile 中的 direct 标记"]
    Rule --> Out[("latest.json")]
```

每条记录都有 `scope`：
- `project`：属于某个项目；`project_root` 是包含 lockfile 或顶层 `node_modules` 的目录。
- `global`：属于全局 npm 目录：
  - Windows：`%AppData%\npm\node_modules`
  - macOS / Linux：`/usr/local/lib/node_modules`、`~/.npm-global/lib/node_modules`

## 3. 配置扫描目录

```mermaid
flowchart LR
    subgraph Settings["设置标签页"]
        Add["添加目录"] --> Picker["目录浏览器<br/>POST /api/fs"]
        Picker --> List["目录列表"]
        Depth["深度滑块 1–20"]
        List --> Save["保存 / 保存并立即扫描<br/>POST /api/config"]
        Depth --> Save
    end
    Save --> Validate{"服务器检查：<br/>• 绝对路径<br/>• 存在且是目录<br/>• 合并重复项<br/>• 1–50 个目录，深度 1–20"}
    Validate -- "有效" --> W[("%LOCALAPPDATA%\libpack\config.json")]
    Validate -- "错误" --> Err["显示已翻译的错误"]
```

**代理查找配置的顺序**（使用第一个存在的文件）：

1. `<数据目录>/config.json`：由界面写入。
2. 放在 `pkgscan` 可执行文件旁的 `config.json`：便于单独在命令行中使用。
3. 默认值：
   - Windows：`~\source`、`~\Documents`、`~\code`、`~\projects`、`~\repos`、`~\Desktop`
   - macOS / Linux：`~/code`、`~/projects`、`~/src`、`~/dev`、`~/repos`、`~/Documents`、`~/Desktop`

目录浏览器**只列出子目录名称**，不读取文件内容。它会隐藏 symlink、junction 和系统目录，并为包含 `package.json` 或 `node_modules` 的目录标记 **“Node 项目”**。

## 4. 检查新版本

```mermaid
sequenceDiagram
    autonumber
    participant B as 浏览器
    participant R as /api/registry
    participant N as registry.npmjs.org

    B->>R: GET ?name=lodash&versions=4.17.15
    R->>R: 检查包名是否有效
    alt 不在缓存中 (30 分钟)
        R->>N: GET /lodash<br/>Accept: application/vnd.npm.install-v1+json
        N-->>R: 精简元数据
    end
    R->>R: latest、deprecated、missing、<br/>inMajor = 同一主版本内最新的稳定版<br/>(0.x：minor 也须相同)
    R-->>B: RegistryInfo
    B->>B: semver 比较 → 最新 / 落后补丁版本 / 落后次版本 / 落后主版本 / 高于 latest
```

界面在包详情页、项目页（“全部检查更新”，6 个请求并行）和更新标签页中使用这些信息。

## 5. 安全检查

安全标签页结合两种来源：对安装脚本的**离线分析**，以及与 OSV.dev 的**在线比对**。

```mermaid
flowchart TB
    subgraph Offline["离线 — 始终运行"]
        S1["latest.json 中的 install_scripts"] --> H["启发式规则集"]
        H --> Lv{"等级"}
        Lv -- "管道交给 shell、访问 .npmrc/.ssh/令牌、<br/>webhook / pastebin / ngrok、<br/>反弹 shell" --> Crit["高度可疑"]
        Lv -- "curl/wget/iwr、调用 PowerShell/shell、<br/>node -e / eval、base64 / 混淆、<br/>URL / IP、隐藏运行" --> High["可疑"]
        Lv -- "未命中任何规则" --> Info["含安装脚本"]
    end

    subgraph Online["在线 — 点击“使用 OSV.dev 检查”时"]
        Q["POST /v1/querybatch<br/>（每批 ≤1000 个 name@version）"] --> Ids["漏洞 ID 列表"]
        Ids --> Det["GET /v1/vulns/{id}<br/>（8 个请求并行）"]
        Det --> Cls{"分类"}
        Cls -- "id 或别名为 MAL-*<br/>或 CWE-506" --> Mal["恶意软件"]
        Cls -- "其余" --> Vul["漏洞<br/>（严重程度取自 GHSA）"]
        Mal --> SJ[("security.json")]
        Vul --> SJ
    end

    Crit --> Page["安全页面 + 概览横幅"]
    High --> Page
    Info --> Page
    SJ --> Page
```

**发送到外部的信息：** 只有**包名和版本**，不包含路径、主机名或文件内容。

**为什么不用关键词识别恶意软件？** 用真实数据测试时，在描述中搜索 “malicious” 一词会误报普通漏洞，例如 `pnpm` 和 `tar` 公告中的 *“a malicious package could…”*。因此工具只依赖**结构化数据**：OpenSSF 的 `MAL-*` 编号和 GitHub 的 `CWE-506`（“Embedded Malicious Code”）。

**检测到恶意软件时**，页面会显示红色框和 4 个处理步骤：
1. 不要在受影响的目录中运行 `npm install` / `npm run`。
2. 删除 `node_modules` 并移除该包。
3. 修改密码，吊销 npm / GitHub / 云服务令牌和 SSH 密钥。
4. 通知 IT。

## 6. 一键修复漏洞

**已公开的漏洞** 表格中的每一行都有 **更新** 按钮。浏览器**只告知哪个目录中的哪个包**；npm 命令由服务器自己生成。

```mermaid
sequenceDiagram
    autonumber
    actor U as 用户
    participant B as 对话框
    participant F as /api/fix
    participant P as updater.ts
    participant N as npm (node npm-cli.js)
    participant A as pkgscan
    participant O as OSV.dev

    U->>B: 点击“更新”
    B->>F: POST { root, name, version, mode: "plan" }
    F->>P: planAction()
    P->>P: 在 latest.json 中？不是恶意软件？
    P->>P: 修复版本 = 每条公告最近的修复版本，<br/>再取其中最大的一个
    P->>P: 选择操作 (见下表)
    P-->>B: 说明 + 确切命令
    U->>B: 点击“运行更新”
    B->>F: POST { ..., mode: "apply" }
    F->>P: applyAction() — 服务器端重新计算计划
    P->>P: 加锁：同一时间只允许一个更新
    P->>P: 备份 package.json + lockfile (项目)
    P->>N: execFile(node, [npm-cli.js, ...args]) — 不经过 shell
    N-->>P: 退出码 + 日志
    P->>A: 重新扫描
    P->>O: 全部重新检查
    P-->>B: 已修复 / 部分修复 / 仍然存在 + 日志 + 备份
```

**服务器自动选择操作：**

```mermaid
flowchart TD
    R["latest.json 中的记录"] --> G{"scope"}
    G -- global --> Top{"位于顶层？"}
    Top -- 是 --> A1["npm install -g --prefix P<br/>--ignore-scripts 名称@修复版本"]
    Top -- "否（位于其他包内部）" --> A2["npm install -g --prefix P<br/>--ignore-scripts 父包@latest"]
    G -- project --> Dir{"direct？"}
    Dir -- 是 --> A3["npm install --ignore-scripts<br/>名称@修复版本"]
    Dir -- 否 --> A4["npm update --ignore-scripts 名称<br/>（在父包允许的范围内）"]
```

| 结果 | 含义 |
|---|---|
| ✅ **已修复** | 该目录中该包的所有安装都 ≥ 修复版本。 |
| ⚠️ **部分修复** | 部分安装已升级，部分仍是旧版本（存在多个嵌套副本）。 |
| ❌ **仍然存在** | npm 已运行完成，但父包锁定了旧版本（例如 `express@4.17.1` 锁定 `qs@6.7.0`）。需要更新父包。 |

> 修复版本选择示例：`protobufjs@7.5.4` 有修复版本 6.11.6、7.5.5 和 8.0.1。工具选择 **7.5.5**（最近的），不会跳到 8.0.1。

## 7. 规划并更新过期的包

**更新** 标签页处理所有项目的**直接依赖**和**顶层全局包**。间接依赖由父包决定，因此不在此列。

```mermaid
flowchart TD
    Start["点击“检查并生成计划”"] --> Fetch["逐个名称查询 registry<br/>（6 个并行）"]
    Fetch --> Row["对每个直接依赖 / 顶层全局包"]
    Row --> Minor["minor = 同一主版本内的最新版<br/>（0.x：minor 也相同；排除预发布版、已弃用版本）"]
    Row --> Major["major = latest，如果主版本不同"]
    Minor --> Def{"默认选择"}
    Major --> Def
    Def -- "有 minor" --> SelMinor["选中 minor ✓"]
    Def -- "只有 major" --> SelNone["不选 — “仅有新的主版本”"]
    Row --> MalChk{"根据 security.json<br/>是恶意包？"}
    MalChk -- 是 --> Block["从计划中排除<br/>“请移除，不要更新”"]
    SelMinor --> Out
    SelNone --> Out
    Out{"执行方式"}
    Out -- "每行的更新按钮" --> One["确认对话框 → 立即运行"]
    Out -- "复制命令 / 下载脚本" --> Script["每个目录的命令<br/>或适用于全部的 .ps1 / .sh"]
```

**每行的更新按钮：** 与[第 6 节](#6-一键修复漏洞)使用相同的防护措施，另外增加两项检查，因为目标版本由用户选择：

```mermaid
sequenceDiagram
    autonumber
    participant B as 对话框
    participant P as planUpgrade()
    participant N as registry
    participant O as OSV /v1/query

    B->>P: { root, name, version, target }
    P->>P: 是直接依赖或顶层全局包？
    P->>N: 重新读取元数据 (跳过缓存)
    P->>P: target 必须是同一主版本内的最新版<br/>或 latest，并且 > 当前安装版本
    P->>O: name@target 是否被标记为恶意软件？
    alt OSV 报告恶意软件，或无法连接
        P-->>B: 拒绝，不运行
    else 安全
        P-->>B: 命令：npm install [--g --prefix] --ignore-scripts name@target
    end
```

**下载的脚本**（例如 `.ps1`）：所有路径和包名都按 PowerShell / sh 的正确语法放在单引号中；某个目录出错时会继续处理其余目录，最后列出出错的目录。

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

## 8. 语言与主题

```mermaid
flowchart LR
    Req["页面请求"] --> Ck{"Cookie 'lang'？"}
    Ck -- "vi / en / zh" --> Loc["使用该语言"]
    Ck -- "没有" --> AL["根据 Accept-Language<br/>（vi → zh → en → 默认 vi）"]
    AL --> Loc
    Loc --> SSR["服务器用词典渲染<br/>lib/i18n.ts"]
    Req --> Th{"Cookie 'theme'？"}
    Th -- "light / dark" --> Attr["html data-theme=…"]
    Th -- "system / 没有" --> Media["CSS prefers-color-scheme"]
    Attr --> SSR
    Media --> SSR
    SSR --> Page["HTML 一开始就是正确的语言和主题<br/>（不闪烁）"]
```

- 词典位于 `ui/src/lib/i18n.ts`。`MessageKey` 类型取自越南语版本，因此 **en 或 zh 缺少任何一个 key，TypeScript 都会在构建时立即报错**。
- API 返回的错误也会被翻译（`I18nError` → `errorMessage()`）。
- 日期和数字按 `vi-VN`、`en-US`、`zh-CN` 格式化。中文使用系统字体（Microsoft YaHei、PingFang SC、Noto Sans SC）。
