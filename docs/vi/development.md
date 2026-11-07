# Phát triển

> Tài liệu chi tiết của **LIBPACK**. Xem tổng quan ở [README](../../README.vi.md) · [English](../en/development.md) · [简体中文](../zh-CN/development.md).

## Build và test

### Agent

```powershell
cd agent
gofmt -l .        # phải không in ra gì
go vet ./...
go test ./... -v
.\build.ps1       # hoặc: $env:VERSION="0.2.0"; .\build.ps1
```

| Test | Kiểm tra |
|---|---|
| `TestLockfileV1` | Cây dependencies lồng nhau, alias `npm:`, bỏ `file:` |
| `TestLockfileV3` | `packages`, alias qua `name`, bỏ workspace / link, cờ `direct`, license |
| `TestScopedNodeModules` | `@scope/pkg`, metadata (license / author / repository), `node_modules` lồng, bỏ `.bin` |
| `TestGlobal` | Thư mục npm toàn cục, package có scope |
| `TestSymlinkLoop` | Vòng lặp symlink không làm treo, không đọc qua link |
| `TestJunctionAndSymlinkRejected` | `ModeIrregular` (junction) và `ModeSymlink` bị từ chối |
| `TestSkipDirsAndDepth` | Bỏ `.git`, `Temp`; tôn trọng `max_depth` |
| `TestLargeFileSkipped` | File > 50 MB không được đọc |
| `TestDedupe` | Gộp bản ghi lockfile và node_modules, giữ cờ `direct` |
| `TestInstallScripts` | Lấy đúng `preinstall/install/postinstall`, `hasInstallScript` từ lockfile |
| `TestConfigFromDataDir` | Ưu tiên `config.json` trong thư mục dữ liệu; báo lỗi khi JSON hỏng |
| `TestNoProcessExecutionImports` | **Không file nào import `os/exec` hay `syscall`** |

### UI

```powershell
cd ui
npm install
npm run typecheck     # tsc --noEmit
npm run dev           # chế độ phát triển, http://127.0.0.1:7788
npm run build         # build production
npm run start
```

**Thử tính năng cập nhật an toàn:** đừng thử trên dự án thật. Trỏ UI vào một môi trường riêng:

```powershell
$env:LIBPACK_DATA_DIR = "C:\temp\lab\data"   # chứa config.json trỏ tới C:\temp\lab\proj
$env:APPDATA = "C:\temp\lab\appdata"         # thư mục npm toàn cục giả: C:\temp\lab\appdata\npm\node_modules
npx next start -H 127.0.0.1 -p 7790
```

### Thêm một ngôn ngữ / chuỗi mới

1. Thêm key vào object `vi` trong `ui/src/lib/i18n.ts`.
2. Thêm cùng key vào `en` và `zh`. Nếu thiếu, `npm run typecheck` sẽ báo lỗi.
3. Dùng `t("key", { tham_so })` ở server (`getI18n()`) hoặc client (`useI18n()`).

## Xử lý sự cố

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| "Không tìm thấy pkgscan tại …" | Chưa build agent. Chạy `agent\build.ps1`, hoặc đặt `LIBPACK_AGENT_PATH`. |
| Tổng quan có 0 dự án | Thư mục mặc định không chứa dự án của bạn. Vào **Cài đặt** để thêm thư mục, rồi **Lưu và quét ngay**. |
| `config.json: invalid escape sequence` | Sửa tay `config.json` và viết `\` đơn. Hãy dùng `/` hoặc `\\`, hoặc chỉnh qua tab Cài đặt. |
| `EADDRINUSE 127.0.0.1:7788` | Đang có một server khác chạy. Tắt nó (`Get-CimInstance Win32_Process` → tìm `next start`), hoặc dùng cổng khác: `npx next start -H 127.0.0.1 -p 7799`. |
| Trang Bảo mật báo "đã quét lại sau lần kiểm tra" | Bấm **Kiểm tra lại** để đồng bộ với lần quét mới. |
| Vá lỗ hổng báo **Vẫn còn** | Package cha khoá cứng phiên bản cũ. Cập nhật package cha (tab Cập nhật), rồi kiểm tra lại. |
| Sau khi cập nhật, một công cụ build lỗi (esbuild, sharp…) | Do `--ignore-scripts`. Nếu tin tưởng package đó: `npm rebuild <tên>` trong thư mục dự án. |
| Muốn hoàn tác một cập nhật | Chép `package.json` + `package-lock.json` từ `%LOCALAPPDATA%\libpack\backups\<thời điểm>\…` về dự án, rồi chạy `npm install --ignore-scripts`. |
| Không tra được registry / OSV | Kiểm tra mạng và proxy. Registry riêng cần xác thực chưa được hỗ trợ (xem [Giới hạn đã biết](#giới-hạn-đã-biết)). |
| `latest-{pm}.json` hỏng | UI coi như chưa có dữ liệu. Bấm **Quét ngay** để tạo lại. |

## Giới hạn đã biết

- **Chỉ hỗ trợ npm và pnpm.** Không quét yarn hay bun. Với pnpm, công cụ chỉ thấy package đã được cài (không đọc `pnpm-lock.yaml`); phụ thuộc của package *global* pnpm nằm trong kho ảo toàn cục của pnpm không được liệt kê, chỉ có bản thân package global. Cũng không quét package của extension VS Code hay trình duyệt.
- **Chỉ giữ lần quét mới nhất**, không có lịch sử thay đổi.
- **Phát hiện mã độc dựa trên danh sách đã biết** (OSV.dev). Package độc hại mới tinh, chưa ai báo cáo, sẽ không bị phát hiện. Phân tích script cài đặt chỉ là dấu hiệu, có thể báo nhầm hoặc bỏ sót; ví dụ mã độc nằm trong file `.js` mà script gọi tới thì không thấy được, vì công cụ không đọc mã nguồn.
- **Đánh dấu "trực tiếp" chỉ có với lockfile v2/v3.** Dự án dùng lockfile v1 hoặc không có lockfile sẽ bị bỏ qua ở tab Cập nhật.
- **Package gián tiếp** chỉ nâng được trong khoảng mà package cha cho phép (`npm update`).
- **Registry riêng cần xác thực** chưa hoạt động, vì công cụ không đọc `.npmrc`.
- **"Kiểm tra tất cả"** ở trang dự án chỉ kiểm tra tối đa 300 package mỗi lần.
- **Không có đăng nhập**, vì UI chỉ lắng nghe trên `127.0.0.1`. Đổi sang `0.0.0.0` là để lộ cả tính năng chạy npm ra mạng, **không được làm**.
- **Không thể đưa lên cloud (ví dụ Cloudflare) nguyên trạng.** Ứng dụng cần đọc ổ đĩa và chạy npm trên chính máy người dùng. Muốn có dashboard tập trung thì cần thêm thành phần gửi báo cáo từ agent lên server.
- **Thư mục `agent/testdata/`** chứa dữ liệu test cố ý viết giả độc hại. Nếu thư mục quét bao gồm repo này, nó sẽ hiện trong cảnh báo.
- Bản build macOS và Linux **chưa được chạy thử trên máy thật**.
