# Mô hình an toàn

> Tài liệu chi tiết của **LIBPACK**. Xem tổng quan ở [README](../../README.vi.md) · [English](../en/security.md) · [简体中文](../zh-CN/security.md).

## Ai được làm gì

| Thành phần | Đọc | Ghi | Chạy tiến trình | Mạng |
|---|---|---|---|---|
| **pkgscan** | Chỉ `package-lock.json` và `node_modules/**/package.json` | Chỉ thư mục dữ liệu libpack | **Không bao giờ** (có test chặn import `os/exec`, `syscall`) | **Không** |
| **Server UI** | `latest-{pm}.json`, `security-{pm}.json`, `config.json`; tên thư mục con (bộ duyệt) | `config.json`, `security-{pm}.json`, `backups/` | `pkgscan scan`; `npm` **chỉ khi người dùng xác nhận** | registry.npmjs.org, api.osv.dev, chỉ khi bấm |
| **Trình duyệt** | Qua API | Cookie `lang`, `theme` | Không | Chỉ tới `127.0.0.1` |

## Rào chắn khi chạy npm

```mermaid
flowchart TD
    Click["Người dùng bấm 'Chạy cập nhật'"] --> O1{"Origin = UI và<br/>Host là loopback?"}
    O1 -- Không --> X1["403"]
    O1 -- Có --> O2{"Bản ghi có trong<br/>latest-{pm}.json?"}
    O2 -- Không --> X2["Từ chối"]
    O2 -- Có --> O3{"Package hiện tại<br/>là mã độc?"}
    O3 -- Có --> X3["Từ chối: hãy gỡ bỏ"]
    O3 -- Không --> O4{"Phiên bản đích hợp lệ?<br/>(bản vá từ OSV / bản đề xuất từ registry)"}
    O4 -- Không --> X4["Từ chối"]
    O4 -- Có --> O5{"Đang có cập nhật khác?"}
    O5 -- Có --> X5["Đợi"]
    O5 -- Không --> Bk["Sao lưu package.json + lockfile"]
    Bk --> Run["node npm-cli.js … --ignore-scripts<br/>execFile, không shell, timeout 10 phút"]
    Run --> Re["Quét lại + kiểm tra lại OSV"]
    Re --> Res["Báo kết quả + log"]
```

| Rủi ro | Biện pháp |
|---|---|
| Script cài đặt độc hại tự chạy | Luôn `--ignore-scripts` và `npm_config_ignore_scripts=true` |
| Chèn lệnh qua tên package hoặc đường dẫn | Không dùng shell: `execFile(node, [npm-cli.js, ...args])`. Tên package và phiên bản phải khớp regex chặt. Lệnh do server tạo. |
| Trang web khác gọi API local | Kiểm tra `Origin` phải khớp `Host`, và `Host` phải là `127.0.0.1` / `localhost` / `[::1]` (chặn DNS rebinding) |
| Cài nhầm một phiên bản độc hại | Bản đích phải là bản do kế hoạch đề xuất (registry đọc lại) và được OSV xác nhận không phải mã độc; nếu không kiểm tra được thì không chạy |
| Làm hỏng dự án | Sao lưu `package.json` + lockfile vào `backups/<thời điểm>/…` trước khi chạy |
| Hai lệnh npm chạy chồng nhau | Khoá: mỗi lúc chỉ một cập nhật |
| Đi vào vòng lặp junction / symlink | `isPlainDir()` bỏ qua `ModeSymlink` và `ModeIrregular`; có test vòng lặp symlink |
| File quá lớn làm treo | Bỏ qua file > 50 MB |
| Lộ thông tin khi tra OSV | Chỉ gửi tên + phiên bản |
| Ai đó trong mạng LAN mở UI | Server chỉ lắng nghe trên `127.0.0.1` |

## Xem thêm

- [Kiểm tra bảo mật](workflows.md#5-kiểm-tra-bảo-mật): phân tích script cài đặt và đối chiếu OSV.dev
- [Vá lỗ hổng bằng một nút bấm](workflows.md#6-vá-lỗ-hổng-bằng-một-nút-bấm)
- [Lập kế hoạch và cập nhật package cũ](workflows.md#7-lập-kế-hoạch-và-cập-nhật-package-cũ)
