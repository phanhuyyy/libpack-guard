# Workflow

> Tài liệu chi tiết của **LIBPACK**. Xem tổng quan ở [README](../../README.vi.md) · [English](../en/workflows.md) · [简体中文](../zh-CN/workflows.md).

## Các màn hình và điều hướng

| Tab / trang | Đường dẫn | Chức năng chính |
|---|---|---|
| **Tổng quan** | `/` | Banner bảo mật, số liệu (bản cài, package khác nhau, dự án, cài toàn cục), danh sách dự án và thư mục toàn cục, nút **Quét lại**. |
| **Chi tiết dự án** | `/project?root=…` | Package trực tiếp hoặc tất cả, lọc theo tên, nút **"Kiểm tra phiên bản mới cho tất cả"** (tối đa 300 package), lọc "chỉ package cũ". |
| **Tìm package** | `/packages?q=&v=&exact=` | Tìm theo tên (một phần hoặc chính xác), lọc phiên bản. Kết quả: package, phiên bản, loại, thư mục, file nguồn. |
| **Chi tiết package** | `/package?name=…` | Mô tả, license, tác giả, link npm / homepage / repo, cảnh báo bảo mật, nút **"Kiểm tra phiên bản mới"**, danh sách nơi cài. |
| **Cập nhật** | `/updates` | Lập kế hoạch cập nhật cho mọi dự án. Nút **Cập nhật** ở từng dòng, hoặc chép lệnh / tải script `.ps1` / `.sh`. |
| **Bảo mật** | `/security` | Package độc hại, script cài đặt đáng ngờ, lỗ hổng đã công bố (có nút **Cập nhật** từng dòng), các package khác có script cài đặt. |
| **Cài đặt** | `/settings` | Chọn thư mục quét bằng bộ duyệt thư mục, chỉnh độ sâu, **Lưu** / **Lưu và quét ngay**. |

**Thanh trên cùng** có bộ chọn ngôn ngữ **VI · EN · 中** và bộ chọn giao diện ☀ / ☾ / 🖥.

```mermaid
flowchart LR
    Home["Tổng quan /"] --> Project["Chi tiết dự án /project"]
    Home --> Search["Tìm package /packages"]
    Search --> Pkg["Chi tiết package /package"]
    Project --> Pkg
    Home -- "banner" --> Sec["Bảo mật /security"]
    Sec --> Pkg
    Sec -- "nút Cập nhật" --> FixDlg["Hộp thoại vá lỗ hổng"]
    Upd["Cập nhật /updates"] -- "nút Cập nhật" --> UpgDlg["Hộp thoại cập nhật"]
    Upd --> Script["Tải .ps1 / .sh"]
    Home -- "Thay đổi" --> Set["Cài đặt /settings"]
    Set --> Picker["Bộ duyệt thư mục"]
```

## 1. Quét package (pkgscan)

Khi bấm **Quét lại** (hoặc **Lưu và quét ngay**), server gọi `POST /api/scan`. Route này chạy đúng file `pkgscan scan`: đường dẫn cố định, tham số cố định, không qua shell, và mỗi lúc chỉ có một lượt quét.

```mermaid
sequenceDiagram
    autonumber
    actor U as Người dùng
    participant B as Trình duyệt
    participant S as Next.js /api/scan
    participant A as pkgscan
    participant D as Thư mục dữ liệu

    U->>B: Bấm "Quét lại"
    B->>S: POST /api/scan (Origin = chính UI)
    S->>S: Kiểm tra Origin + Host là loopback
    S->>A: execFile(pkgscan, ["scan"]) — không shell
    A->>A: Đọc config.json (thư mục dữ liệu → cạnh exe → mặc định)
    A->>A: Quét thư mục npm toàn cục
    A->>A: Duyệt các thư mục gốc (xem sơ đồ dưới)
    A->>A: Loại trùng name + version + project_root
    A->>D: Ghi latest.json (ghi file tạm rồi đổi tên)
    A-->>S: "Đã quét N package"
    S-->>B: { ok: true }
    B->>B: router.refresh() — trang đọc lại latest.json
```

**Cách pkgscan duyệt thư mục:**

```mermaid
flowchart TD
    Start(["Thư mục gốc"]) --> IsDir{"Thư mục thật?<br/>không symlink / junction"}
    IsDir -- Không --> Skip(["Bỏ qua"])
    IsDir -- Có --> Lock{"Có package-lock.json<br/>≤ 50 MB?"}
    Lock -- Có --> ParseLock["Đọc lockfile v1/v2/v3"]
    Lock -- Không --> Children
    ParseLock --> Children["Liệt kê thư mục con<br/>(chỉ thư mục thật)"]
    Children --> Each{"Tên thư mục con"}
    Each -- "node_modules" --> NM["Đọc node_modules<br/>(xem mục 2)"]
    Each -- ".git, Temp, tmp, AppData,<br/>$Recycle.Bin, .cache, .Trash" --> Skip
    Each -- "khác" --> Depth{"Độ sâu < max_depth?"}
    Depth -- Có --> Start
    Depth -- Không --> Skip
```

**Giới hạn an toàn khi duyệt:**

| Giới hạn | Giá trị | Vị trí trong code |
|---|---|---|
| Độ sâu thư mục mặc định | 8 (chỉnh được từ 1–20) | `agent/config.go` |
| Độ sâu `node_modules` lồng nhau | 12 | `agent/nodemodules.go` |
| Kích thước file tối đa | 50 MB | `agent/walk.go` |
| Symlink / junction / mount point | Luôn bỏ qua | `isPlainDir()` trong `agent/walk.go` |
| Độ dài script cài đặt lưu lại | 2.000 ký tự | `agent/nodemodules.go` |

## 2. Đọc lockfile và node_modules

```mermaid
flowchart TD
    subgraph LF["package-lock.json"]
        V{"lockfileVersion"}
        V -- "2 / 3: có 'packages'" --> P["Duyệt khoá 'node_modules/…'<br/>• bỏ '' (chính dự án)<br/>• bỏ mục link: true (workspace)<br/>• tên alias lấy từ trường 'name'<br/>• direct = có trong dependencies/<br/>devDependencies của gốc<br/>• đọc license, hasInstallScript"]
        V -- "1: chỉ có 'dependencies'" --> D1["Đệ quy cây dependencies<br/>• alias 'npm:tên@ver'<br/>• bỏ 'file:'"]
    end

    subgraph NM["node_modules"]
        L["Liệt kê thư mục con"] --> Sc{"Tên bắt đầu bằng"}
        Sc -- "'.'" --> X(["Bỏ (.bin, .cache…)"])
        Sc -- "'@'" --> Scope["@scope/tên/package.json"]
        Sc -- "khác" --> Plain["tên/package.json"]
        Scope --> Read["Đọc name, version, description,<br/>license, author, homepage, repository,<br/>scripts.preinstall/install/postinstall"]
        Plain --> Read
        Read --> Nested{"Có node_modules lồng?"}
        Nested -- Có --> L
    end

    P --> Merge
    D1 --> Merge
    Read --> Merge["Gộp + loại trùng<br/>(name, version, project_root)"]
    Merge --> Rule["Bản ghi từ node_modules thắng<br/>(chứng tỏ đã cài, có metadata)<br/>nhưng giữ cờ direct từ lockfile"]
    Rule --> Out[("latest.json")]
```

Mỗi bản ghi có `scope`:
- `project`: thuộc một dự án; `project_root` là thư mục chứa lockfile hoặc `node_modules` cấp cao nhất.
- `global`: thuộc thư mục npm toàn cục:
  - Windows: `%AppData%\npm\node_modules`
  - macOS / Linux: `/usr/local/lib/node_modules`, `~/.npm-global/lib/node_modules`

## 3. Cấu hình thư mục quét

```mermaid
flowchart LR
    subgraph Settings["Tab Cài đặt"]
        Add["Thêm thư mục"] --> Picker["Bộ duyệt thư mục<br/>POST /api/fs"]
        Picker --> List["Danh sách thư mục"]
        Depth["Thanh trượt độ sâu 1–20"]
        List --> Save["Lưu / Lưu và quét ngay<br/>POST /api/config"]
        Depth --> Save
    end
    Save --> Validate{"Server kiểm tra:<br/>• đường dẫn tuyệt đối<br/>• tồn tại và là thư mục<br/>• gộp trùng<br/>• 1–50 thư mục, độ sâu 1–20"}
    Validate -- "hợp lệ" --> W[("%LOCALAPPDATA%\libpack\config.json")]
    Validate -- "lỗi" --> Err["Báo lỗi đã dịch"]
```

**Thứ tự agent tìm cấu hình** (file đầu tiên tồn tại sẽ được dùng):

1. `<thư mục dữ liệu>/config.json`: do giao diện ghi.
2. `config.json` đặt cạnh file `pkgscan`: tiện khi dùng riêng bằng dòng lệnh.
3. Mặc định:
   - Windows: `~\source`, `~\Documents`, `~\code`, `~\projects`, `~\repos`, `~\Desktop`
   - macOS / Linux: `~/code`, `~/projects`, `~/src`, `~/dev`, `~/repos`, `~/Documents`, `~/Desktop`

Bộ duyệt thư mục **chỉ liệt kê tên thư mục con**, không đọc nội dung file. Nó ẩn symlink, junction và thư mục hệ thống, đồng thời đánh dấu **"dự án Node"** cho thư mục nào có `package.json` hoặc `node_modules`.

## 4. Kiểm tra phiên bản mới

```mermaid
sequenceDiagram
    autonumber
    participant B as Trình duyệt
    participant R as /api/registry
    participant N as registry.npmjs.org

    B->>R: GET ?name=lodash&versions=4.17.15
    R->>R: Kiểm tra tên package hợp lệ
    alt chưa có trong cache (30 phút)
        R->>N: GET /lodash<br/>Accept: application/vnd.npm.install-v1+json
        N-->>R: metadata rút gọn
    end
    R->>R: latest, deprecated, missing,<br/>inMajor = bản ổn định mới nhất cùng major<br/>(0.x: cùng cả minor)
    R-->>B: RegistryInfo
    B->>B: So sánh semver → Mới nhất / Cũ (patch / minor / major) / Mới hơn latest
```

Giao diện dùng thông tin này ở trang chi tiết package, trang dự án ("kiểm tra tất cả", 6 request song song) và tab Cập nhật.

## 5. Kiểm tra bảo mật

Tab Bảo mật kết hợp hai nguồn: **phân tích offline** các script cài đặt, và **đối chiếu trực tuyến** với OSV.dev.

```mermaid
flowchart TB
    subgraph Offline["Offline — luôn chạy"]
        S1["install_scripts trong latest.json"] --> H["Bộ luật heuristics"]
        H --> Lv{"Mức độ"}
        Lv -- "pipe vào shell, đụng .npmrc/.ssh/token,<br/>webhook / pastebin / ngrok,<br/>reverse shell" --> Crit["Rất đáng ngờ"]
        Lv -- "curl/wget/iwr, gọi PowerShell/shell,<br/>node -e / eval, base64 / che giấu,<br/>URL / IP, chạy ẩn" --> High["Đáng ngờ"]
        Lv -- "không khớp luật nào" --> Info["Có script cài đặt"]
    end

    subgraph Online["Trực tuyến — khi bấm 'Kiểm tra với OSV.dev'"]
        Q["POST /v1/querybatch<br/>(≤1000 name@version mỗi lô)"] --> Ids["Danh sách mã lỗ hổng"]
        Ids --> Det["GET /v1/vulns/{id}<br/>(8 request song song)"]
        Det --> Cls{"Phân loại"}
        Cls -- "id hoặc alias là MAL-*<br/>hoặc CWE-506" --> Mal["Mã độc"]
        Cls -- "còn lại" --> Vul["Lỗ hổng<br/>(severity từ GHSA)"]
        Mal --> SJ[("security.json")]
        Vul --> SJ
    end

    Crit --> Page["Trang Bảo mật + banner Tổng quan"]
    High --> Page
    Info --> Page
    SJ --> Page
```

**Thông tin gửi ra ngoài:** chỉ **tên và phiên bản package**, không có đường dẫn, tên máy hay nội dung file.

**Vì sao không nhận diện mã độc bằng từ khoá?** Khi thử với dữ liệu thật, cách tìm từ "malicious" trong mô tả báo nhầm các lỗ hổng thường, ví dụ *"a malicious package could…"* trong advisory của `pnpm` và `tar`. Vì vậy công cụ chỉ dựa vào **dữ liệu có cấu trúc**: mã `MAL-*` của OpenSSF và mã `CWE-506` ("Embedded Malicious Code") của GitHub.

**Khi phát hiện mã độc**, trang hiện khung đỏ kèm 4 bước xử lý:
1. Không chạy `npm install` / `npm run` ở các thư mục bị ảnh hưởng.
2. Xoá `node_modules` và gỡ package.
3. Đổi mật khẩu, thu hồi token npm / GitHub / cloud và SSH key.
4. Báo IT.

## 6. Vá lỗ hổng bằng một nút bấm

Mỗi dòng trong bảng **Lỗ hổng bảo mật đã công bố** có nút **Cập nhật**. Trình duyệt **chỉ cho biết package nào ở thư mục nào**; lệnh npm do server tự tạo.

```mermaid
sequenceDiagram
    autonumber
    actor U as Người dùng
    participant B as Hộp thoại
    participant F as /api/fix
    participant P as updater.ts
    participant N as npm (node npm-cli.js)
    participant A as pkgscan
    participant O as OSV.dev

    U->>B: Bấm "Cập nhật"
    B->>F: POST { root, name, version, mode: "plan" }
    F->>P: planAction()
    P->>P: Có trong latest.json? Không phải mã độc?
    P->>P: Bản vá = bản vá gần nhất của từng advisory,<br/>lấy bản lớn nhất trong số đó
    P->>P: Chọn hành động (bảng dưới)
    P-->>B: Mô tả + lệnh chính xác
    U->>B: Bấm "Chạy cập nhật"
    B->>F: POST { ..., mode: "apply" }
    F->>P: applyAction() — tính lại kế hoạch phía server
    P->>P: Khoá: mỗi lúc chỉ một cập nhật
    P->>P: Sao lưu package.json + lockfile (dự án)
    P->>N: execFile(node, [npm-cli.js, ...args]) — không shell
    N-->>P: exit code + log
    P->>A: Quét lại
    P->>O: Kiểm tra lại toàn bộ
    P-->>B: Đã vá / Vá một phần / Vẫn còn + log + bản sao lưu
```

**Server tự chọn hành động:**

```mermaid
flowchart TD
    R["Bản ghi trong latest.json"] --> G{"scope"}
    G -- global --> Top{"Ở cấp trên cùng?"}
    Top -- Có --> A1["npm install -g --prefix P<br/>--ignore-scripts tên@bản-vá"]
    Top -- "Không (nằm trong package khác)" --> A2["npm install -g --prefix P<br/>--ignore-scripts cha@latest"]
    G -- project --> Dir{"direct?"}
    Dir -- Có --> A3["npm install --ignore-scripts<br/>tên@bản-vá"]
    Dir -- Không --> A4["npm update --ignore-scripts tên<br/>(trong khoảng package cha cho phép)"]
```

| Kết quả | Ý nghĩa |
|---|---|
| ✅ **Đã vá** | Mọi bản cài của package trong thư mục đó đều ≥ bản vá. |
| ⚠️ **Vá một phần** | Một số bản đã lên, một số vẫn cũ (nhiều bản lồng nhau). |
| ❌ **Vẫn còn** | npm chạy xong nhưng package cha khoá cứng phiên bản cũ (ví dụ `express@4.17.1` khoá `qs@6.7.0`). Cần cập nhật package cha. |

> Ví dụ cách chọn bản vá: `protobufjs@7.5.4` có các bản vá 6.11.6, 7.5.5 và 8.0.1. Công cụ chọn **7.5.5** (gần nhất), không nhảy lên 8.0.1.

## 7. Lập kế hoạch và cập nhật package cũ

Tab **Cập nhật** xét các **package trực tiếp** của mọi dự án và các **package global cấp trên cùng**. Package gián tiếp do package cha quyết định nên không nằm ở đây.

```mermaid
flowchart TD
    Start["Bấm 'Kiểm tra & lập kế hoạch'"] --> Fetch["Hỏi registry cho từng tên<br/>(6 song song)"]
    Fetch --> Row["Với mỗi package trực tiếp / global cấp trên cùng"]
    Row --> Minor["minor = bản mới nhất cùng major<br/>(0.x: cùng minor; bỏ prerelease, deprecated)"]
    Row --> Major["major = latest nếu khác major"]
    Minor --> Def{"Mặc định chọn"}
    Major --> Def
    Def -- "có minor" --> SelMinor["Chọn minor ✓"]
    Def -- "chỉ có major" --> SelNone["Không chọn — 'Chỉ có bản major mới'"]
    Row --> MalChk{"Là mã độc<br/>theo security.json?"}
    MalChk -- Có --> Block["Loại khỏi kế hoạch<br/>'hãy gỡ bỏ, không cập nhật'"]
    SelMinor --> Out
    SelNone --> Out
    Out{"Cách thực hiện"}
    Out -- "Nút Cập nhật từng dòng" --> One["Hộp thoại xác nhận → chạy ngay"]
    Out -- "Chép lệnh / tải script" --> Script["Lệnh cho từng thư mục<br/>hoặc .ps1 / .sh cho tất cả"]
```

**Nút Cập nhật ở từng dòng:** dùng chung rào chắn với [mục 6](#6-vá-lỗ-hổng-bằng-một-nút-bấm), cộng thêm hai kiểm tra vì phiên bản đích do người dùng chọn:

```mermaid
sequenceDiagram
    autonumber
    participant B as Hộp thoại
    participant P as planUpgrade()
    participant N as registry
    participant O as OSV /v1/query

    B->>P: { root, name, version, target }
    P->>P: Package trực tiếp hoặc global cấp trên cùng?
    P->>N: Đọc lại metadata (bỏ qua cache)
    P->>P: target phải là bản mới nhất cùng major<br/>hoặc latest, và > bản đang cài
    P->>O: name@target có bị đánh dấu mã độc?
    alt OSV báo mã độc, hoặc không kết nối được
        P-->>B: Từ chối, không chạy
    else an toàn
        P-->>B: Lệnh: npm install [--g --prefix] --ignore-scripts name@target
    end
```

**Script tải về** (ví dụ `.ps1`): mọi đường dẫn và tên package đều được đặt trong nháy đơn đúng cú pháp PowerShell / sh, thư mục nào lỗi thì vẫn chạy tiếp các thư mục còn lại, và cuối cùng liệt kê các thư mục lỗi.

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

## 8. Ngôn ngữ và giao diện

```mermaid
flowchart LR
    Req["Request trang"] --> Ck{"Cookie 'lang'?"}
    Ck -- "vi / en / zh" --> Loc["Dùng ngôn ngữ đó"]
    Ck -- "không có" --> AL["Theo Accept-Language<br/>(vi → zh → en → mặc định vi)"]
    AL --> Loc
    Loc --> SSR["Server render bằng từ điển<br/>lib/i18n.ts"]
    Req --> Th{"Cookie 'theme'?"}
    Th -- "light / dark" --> Attr["html data-theme=…"]
    Th -- "system / không có" --> Media["CSS prefers-color-scheme"]
    Attr --> SSR
    Media --> SSR
    SSR --> Page["HTML đúng ngôn ngữ và theme ngay từ đầu<br/>(không nháy)"]
```

- Từ điển nằm trong `ui/src/lib/i18n.ts`. Kiểu `MessageKey` lấy từ bản tiếng Việt, nên **thiếu một key ở en hoặc zh là TypeScript báo lỗi ngay lúc build**.
- Lỗi trả về từ API cũng được dịch (`I18nError` → `errorMessage()`).
- Ngày và số được định dạng theo `vi-VN`, `en-US`, `zh-CN`. Chữ Trung dùng font hệ thống (Microsoft YaHei, PingFang SC, Noto Sans SC).
