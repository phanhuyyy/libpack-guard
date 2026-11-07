# 开发

> **LIBPACK** 详细文档。概览：[README](../../README.zh-CN.md) · [English](../en/development.md) · [Tiếng Việt](../vi/development.md)。

## 构建与测试

### Agent

```powershell
cd agent
gofmt -l .        # 应该没有任何输出
go vet ./...
go test ./... -v
.\build.ps1       # 或：$env:VERSION="0.2.0"; .\build.ps1
```

| 测试 | 检查内容 |
|---|---|
| `TestLockfileV1` | 嵌套的 dependencies 树、`npm:` 别名、跳过 `file:` |
| `TestLockfileV3` | `packages`、通过 `name` 的别名、跳过 workspace / link、`direct` 标记、license |
| `TestScopedNodeModules` | `@scope/pkg`、元数据（license / author / repository）、嵌套 `node_modules`、跳过 `.bin` |
| `TestGlobal` | 全局 npm 目录、带 scope 的包 |
| `TestSymlinkLoop` | symlink 循环不会导致卡死，不会穿过链接读取 |
| `TestJunctionAndSymlinkRejected` | `ModeIrregular`（junction）和 `ModeSymlink` 被拒绝 |
| `TestSkipDirsAndDepth` | 跳过 `.git`、`Temp`；遵守 `max_depth` |
| `TestLargeFileSkipped` | 不读取 > 50 MB 的文件 |
| `TestDedupe` | 合并 lockfile 和 node_modules 记录，保留 `direct` 标记 |
| `TestInstallScripts` | 正确提取 `preinstall/install/postinstall`，以及 lockfile 中的 `hasInstallScript` |
| `TestConfigFromDataDir` | 优先使用数据目录中的 `config.json`；JSON 损坏时报错 |
| `TestNoProcessExecutionImports` | **没有任何文件导入 `os/exec` 或 `syscall`** |

### UI

```powershell
cd ui
npm install
npm run typecheck     # tsc --noEmit
npm run dev           # 开发模式，http://127.0.0.1:7788
npm run build         # 生产构建
npm run start
```

**安全地测试更新功能：** 不要在真实项目上测试。让界面指向一个独立环境：

```powershell
$env:LIBPACK_DATA_DIR = "C:\temp\lab\data"   # 其中的 config.json 指向 C:\temp\lab\proj
$env:APPDATA = "C:\temp\lab\appdata"         # 模拟的全局 npm 目录：C:\temp\lab\appdata\npm\node_modules
npx next start -H 127.0.0.1 -p 7790
```

### 添加语言或新字符串

1. 在 `ui/src/lib/i18n.ts` 的 `vi` 对象中添加 key。
2. 在 `en` 和 `zh` 中添加相同的 key。如果缺少，`npm run typecheck` 会报错。
3. 在服务器端（`getI18n()`）或客户端（`useI18n()`）使用 `t("key", { 参数 })`。

## 故障排查

| 症状 | 原因 / 解决方法 |
|---|---|
| “未在 … 找到 pkgscan” | 尚未构建代理。运行 `agent\build.ps1`，或设置 `LIBPACK_AGENT_PATH`。 |
| 概览中项目数为 0 | 默认目录中没有你的项目。进入 **设置** 添加目录，然后点击 **保存并立即扫描**。 |
| `config.json: invalid escape sequence` | 手动编辑 `config.json` 时写了单个 `\`。请使用 `/` 或 `\\`，或通过设置标签页修改。 |
| `EADDRINUSE 127.0.0.1:7788` | 已有另一个服务器在运行。关闭它（`Get-CimInstance Win32_Process` → 查找 `next start`），或使用其他端口：`npx next start -H 127.0.0.1 -p 7799`。 |
| 安全页面提示“上次检查后你已重新扫描” | 点击 **重新检查** 以与新的扫描同步。 |
| 修复漏洞结果为 **仍然存在** | 父包锁定了旧版本。更新父包（更新标签页），然后重新检查。 |
| 更新后某个构建工具出错（esbuild、sharp…） | 由 `--ignore-scripts` 导致。如果信任该包：在项目目录中运行 `npm rebuild <名称>`。 |
| 想要撤销某次更新 | 从 `%LOCALAPPDATA%\libpack\backups\<时间>\…` 将 `package.json` + `package-lock.json` 复制回项目，然后运行 `npm install --ignore-scripts`。 |
| 无法查询 registry / OSV | 检查网络和代理。尚不支持需要认证的私有 registry（见[已知限制](#已知限制)）。 |
| `latest-{pm}.json` 损坏 | 界面会视为没有数据。点击 **立即扫描** 重新生成。 |

## 已知限制

- **仅支持 npm 和 pnpm。** 不扫描 yarn 或 bun。对于 pnpm，只能看到已安装的包（不读取 `pnpm-lock.yaml`）；pnpm *全局*包位于 pnpm 全局虚拟存储中的依赖不会列出，只列出全局包本身。也不扫描 VS Code 扩展或浏览器扩展中的包。
- **只保留最近一次扫描**，没有变更历史。
- **恶意软件检测基于已知列表**（OSV.dev）。全新的、尚无人报告的恶意包不会被发现。安装脚本分析只是迹象，可能误报或漏报；例如恶意代码位于脚本调用的 `.js` 文件中时无法发现，因为工具不读取源代码。
- **“直接依赖”标记仅适用于 lockfile v2/v3。** 使用 lockfile v1 或没有 lockfile 的项目会在更新标签页中被跳过。
- **间接依赖** 只能在父包允许的范围内升级（`npm update`）。
- **需要认证的私有 registry** 尚不可用，因为工具不读取 `.npmrc`。
- 项目页的 **“全部检查更新”** 每次最多只检查 300 个包。
- **没有登录功能**，因为界面只监听 `127.0.0.1`。改为 `0.0.0.0` 会把运行 npm 的功能暴露到网络上，**切勿这样做**。
- **无法原样部署到云端（例如 Cloudflare）。** 应用需要在用户自己的机器上读取磁盘并运行 npm。如需集中式仪表盘，需要增加一个从代理向服务器发送报告的组件。
- **`agent/testdata/` 目录** 包含故意伪造的恶意测试数据。如果扫描目录包含本仓库，它会出现在警报中。
- macOS 和 Linux 构建**尚未在真实机器上测试**。
