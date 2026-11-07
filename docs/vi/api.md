# API và dòng lệnh

> Tài liệu chi tiết của **LIBPACK**. Xem tổng quan ở [README](../../README.vi.md) · [English](../en/api.md) · [简体中文](../zh-CN/api.md).

## API nội bộ

Mọi API chỉ phục vụ giao diện trên chính máy này. Các API có tác dụng phụ (POST) đều yêu cầu `Origin` khớp `Host`, và `Host` phải là loopback.

| Method | Đường dẫn | Body / Query | Trả về | Tác dụng phụ |
|---|---|---|---|---|
| `POST` | `/api/scan` | — | `{ ok, message }` | Chạy `pkgscan scan` |
| `GET` | `/api/registry` | `?name=&versions=a,b` | `RegistryInfo` (`latest`, `inMajor`, `deprecated`, `missing`…) | Gọi registry (cache 30 phút) |
| `POST` | `/api/security` | — | `{ ok, malware, vulns }` | Gọi OSV, ghi `security.json` |
| `POST` | `/api/fs` | `{ path? }` | `{ shortcuts }` hoặc `{ path, parent, dirs[] }` | Chỉ liệt kê tên thư mục |
| `POST` | `/api/config` | `{ roots[], max_depth }` | `{ ok, config }` | Ghi `config.json` |
| `POST` | `/api/fix` | `{ root, name, version, mode: "plan" \| "apply", target? }` | `plan`: `{ action }` · `apply`: `{ status, after[], log, backup, action }` | `apply`: **chạy npm**, sao lưu, quét lại, kiểm tra lại OSV |

`/api/fix` không có `target` thì là **vá lỗ hổng** (server tự chọn bản vá). Có `target` thì là **nâng cấp** từ tab Cập nhật (server xác minh `target`).

## Dòng lệnh pkgscan

```text
pkgscan scan              Quét và lưu kết quả vào thư mục dữ liệu
pkgscan scan --dry-run    Quét và in JSON ra màn hình, không lưu
pkgscan find <tên> [--version <phiên bản>]
                          Tìm package trong kết quả quét gần nhất
pkgscan version
```

Ví dụ trên Windows:

```powershell
agent\dist\pkgscan-windows-amd64.exe scan --dry-run > scan.json
agent\dist\pkgscan-windows-amd64.exe scan
agent\dist\pkgscan-windows-amd64.exe find axios --version 1.7.4
```

```text
TÊN    PHIÊN BẢN  PHẠM VI  DỰ ÁN
axios  1.7.4      project  C:\Users\me\projects\web

1 kết quả (lần quét 2026-11-07T04:38:26Z)
```
