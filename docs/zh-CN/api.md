# API 与命令行

> **LIBPACK** 详细文档。概览：[README](../../README.zh-CN.md) · [English](../en/api.md) · [Tiếng Việt](../vi/api.md)。

## 内部 API

所有 API 只服务于本机上的界面。有副作用的 API（POST）都要求 `Origin` 与 `Host` 一致，且 `Host` 必须是 loopback。

| 方法 | 路径 | Body / Query | 返回 | 副作用 |
|---|---|---|---|---|
| `POST` | `/api/scan` | — | `{ ok, message }` | 运行 `pkgscan scan` |
| `GET` | `/api/registry` | `?name=&versions=a,b` | `RegistryInfo`（`latest`、`inMajor`、`deprecated`、`missing`…） | 调用 registry（缓存 30 分钟） |
| `POST` | `/api/security` | — | `{ ok, malware, vulns }` | 调用 OSV，写入 `security.json` |
| `POST` | `/api/fs` | `{ path? }` | `{ shortcuts }` 或 `{ path, parent, dirs[] }` | 只列出目录名称 |
| `POST` | `/api/config` | `{ roots[], max_depth }` | `{ ok, config }` | 写入 `config.json` |
| `POST` | `/api/fix` | `{ root, name, version, mode: "plan" \| "apply", target? }` | `plan`：`{ action }` · `apply`：`{ status, after[], log, backup, action }` | `apply`：**运行 npm**、备份、重新扫描、重新检查 OSV |

`/api/fix` 不带 `target` 时为**修复漏洞**（服务器自动选择修复版本）。带 `target` 时为来自更新标签页的**升级**（服务器验证 `target`）。

## pkgscan 命令行

```text
pkgscan scan              扫描并将结果保存到数据目录
pkgscan scan --dry-run    扫描并将 JSON 打印到屏幕，不保存
pkgscan find <名称> [--version <版本>]
                          在最近一次扫描结果中查找包
pkgscan version
```

Windows 示例：

```powershell
agent\dist\pkgscan-windows-amd64.exe scan --dry-run > scan.json
agent\dist\pkgscan-windows-amd64.exe scan
agent\dist\pkgscan-windows-amd64.exe find axios --version 1.7.4
```

```text
名称   版本   范围     项目
axios  1.7.4  project  C:\Users\me\projects\web

1 条结果（扫描时间 2026-11-07T04:38:26Z）
```

> `pkgscan` 目前以越南语输出帮助和结果；上方内容为便于阅读而翻译。
