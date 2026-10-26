# Profile Studio — Windows và macOS Intel

**Tải bản thử nghiệm:** [GitHub Releases](https://github.com/HoangAnh2k7/HoangAnh2k7/releases/tag/v0.1.1). Các gói đã tạo trực tiếp trên Windows/macOS Intel; kiểm thử Electron từ mã nguồn trên hai runner đã đạt ([CI](https://github.com/HoangAnh2k7/HoangAnh2k7/actions/runs/40319589492)). Chưa kiểm thử thủ công mọi chức năng của gói ZIP trên máy người dùng.

Bản thay thế độc lập được xây dựng từ danh mục chức năng quan sát trong bộ cài GPMLoginGlobal do người dùng cung cấp. **Đây là bản nền tảng 0.1.1, chưa tương đương toàn bộ GPMLogin.** Không dùng lại thương hiệu, tài khoản cloud hoặc browser engine đã chỉnh sửa của GPM.

## Thay đổi trong mã nguồn 0.1.1

Có thêm “Chỉ xóa cache” giữ cookie/dữ liệu trang và chặn xóa nhóm còn hồ sơ, kể cả trong thùng rác. [Hướng dẫn và phạm vi kiểm chứng](docs/CHANGES_0.1.1.md). Bản 0.1.1 đã đạt 21 test và smoke Electron từ mã nguồn trên Windows/macOS Intel. Các gói ZIP chưa được nghiệm thu thủ công sau giải nén.

## Phân tích lại GPMLogin

[Báo cáo đối chiếu bộ cài 5.1.2, tài liệu chính thức và video v3](docs/analysis/REANALYSIS_REPORT.md) ghi rõ cấu trúc dữ liệu/API, luồng sử dụng, khác biệt của bản 0.1 và phần chưa xác minh. [Quan sát video theo thời gian](docs/analysis/VIDEO_OBSERVATIONS.md) giúp đối chiếu thao tác. Đây là tài liệu phân tích; ứng dụng và gói phát hành chưa được cập nhật trong lượt này.

## Sử dụng gói ứng dụng

Gói ZIP trong `artifacts/` gồm runtime Electron, không cần cài Node để mở:

- Windows x64: giải nén toàn bộ thư mục, mở `profile-studio.exe`.
- macOS Intel: giải nén, đưa `Profile Studio.app` vào Applications rồi mở. Đây là gói chưa ký Developer ID/chưa notarize; macOS có thể chặn mở. Muốn phát hành bản cài cho người khác cần ký/notarize trên máy Mac với tài khoản nhà phát triển phù hợp.

Gói dùng Electron 45, cần hệ điều hành được phiên bản runtime này hỗ trợ; manifest gói macOS đặt tối thiểu macOS 13.0. Chưa kiểm thử gói trên Windows/macOS và không cam kết hỗ trợ mọi bản macOS Intel cũ. Khi đóng gói macOS trên Linux, packager không thể nhúng ASAR integrity digest vì không có codesign; cần đóng gói/ký lại trên Mac trước khi phát hành. Gói không dành cho macOS ARM hoặc Windows 32-bit.

## Những phần đã viết

- Tạo/sửa/nhân bản/xóa cấu hình hồ sơ; tên, ghi chú, màu, ngôn ngữ, timezone, user agent, kích thước cửa sổ, danh sách trang mở đầu.
- Tìm kiếm/sắp xếp/lọc, ghim hồ sơ, lần chạy gần nhất, thùng rác/khôi phục và xóa vĩnh viễn, đổi nhóm/proxy hàng loạt, chọn nhiều, tạo hàng loạt và mở/đóng hàng loạt có giới hạn số phiên khởi chạy đồng thời.
- Nhóm, nhãn màu và tham chiếu được dọn khi xóa. Xóa nhóm bị chặn nếu còn hồ sơ, kể cả trong thùng rác; cần chuyển hồ sơ ra ngoài hoặc xóa vĩnh viễn trước.
- Hồ sơ dùng session Electron `persist:` riêng; mã quản lý cookie/cache/local storage, đóng/mở lại hồ sơ, nhập/xuất cookie JSON, dọn dữ liệu đã được triển khai. Cookie tách biệt và mở lại đã đạt smoke Electron từ mã nguồn trên Windows/macOS Intel. Có mục riêng chỉ xóa HTTP cache giữ cookie/dữ liệu trang; cần đóng hồ sơ trước khi thực hiện.
- HTTP/HTTPS proxy có xác thực, SOCKS5 không xác thực; chỉ dẫn IP được kiểm tra qua `api.ipify.org`. Chromium không hỗ trợ SOCKS5 có username/password; ứng dụng báo lỗi thay vì dùng trực tiếp ngoài ý muốn. Không có UDP SOCKS5/route/rotate proxy theo nhà cung cấp.
- Nhập/xuất cấu hình JSON/CSV/XLSX. JSON bundle ánh xạ lại nhóm/nhãn/proxy khi nhập trên máy khác; không xuất mật khẩu proxy mặc định. CSV/XLSX có các cột `name,groupId,tagIds,proxyId,startUrls,userAgent,language,timezone,width,height,notes,color`; `tagIds` và `startUrls` là chuỗi mảng JSON. Đây là định dạng của Profile Studio, chưa xác nhận tương thích định dạng GPM.
- Thêm extension Chromium từ thư mục giải nén, bật theo nhóm. Không cam kết mọi extension Chrome Web Store hoạt động trong Electron.
- Sắp xếp cửa sổ; đồng bộ click/cuộn/nội dung nhập giữa các cửa sổ đang ở cùng trang. Đồng bộ chỉ xử lý document chính, chưa hỗ trợ đầy đủ iframe, canvas, phím tắt, drag/drop hoặc đồng bộ đa trình duyệt. Nội dung nhập nhạy cảm cũng được chuyển sang các cửa sổ người dùng chọn khi bật tính năng.
- Quy trình tự động hóa tuần tự: `goto`, `wait`, `click`, `type`, `screenshot`. Ảnh lưu trong thư mục dữ liệu ứng dụng. Đây là công cụ độc lập, không chạy workflow riêng của GPM Automate.
- API localhost có Bearer token, mặc định tắt, chặn Origin của trang web, không trả mật khẩu proxy qua API trạng thái. Không tương thích API GPM/MCP khi chưa có kiểm thử đối chiếu.

Smoke Electron đã xác nhận các luồng nêu ở đầu trang trên hai nền tảng; **chưa kiểm chứng mọi chức năng hoặc mọi môi trường đích**. Chi tiết trạng thái nghiệm thu và các chức năng còn thiếu: [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md). Danh mục 29 nhóm quan sát trong mẫu: [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md).

## Các phần chưa có

Fingerprint ở cấp engine (Canvas/WebGL/audio/fonts/client rect/WebRTC/device identity...), G-Chromium/G-Firefox và quản lý phiên bản của chúng, kéo chọn/tùy biến toàn bộ cột, shortcut hồ sơ, đồng bộ cloud/nhóm làm việc/role/quyền chia sẻ, license/login GPM, dịch vụ route proxy, plugin IPv6, GPM Automate, updater và AI của sản phẩm gốc. Cần giao thức/tài liệu, môi trường kiểm chứng và engine phù hợp; bộ cài một mình không cung cấp mã máy chủ.

## Phát triển

Node.js 24 được dùng để kiểm thử (tối thiểu 22.12 theo dependency). Trong thư mục checkout hiện tại:

```sh
npm ci --include=dev
npm start
```

Giữ sandbox Electron bật. Với cloud có proxy, Node 24 cần `NODE_USE_ENV_PROXY=1` khi tải Electron. Cache npm/Electron phải trỏ tới vị trí ghi được nếu thư mục home chỉ đọc. Không tắt TLS, checksum hoặc sandbox để vượt lỗi cài/chạy.

```sh
npm test                    # lưu trữ, nhập/xuất bundle, API và DOM giao diện
npm run smoke               # Electron thật + fixture localhost, cần desktop và sandbox hoạt động
npm run package:windows     # gói ZIP Windows x64, chưa ký
npm run package:macos       # gói ZIP macOS Intel, chưa ký
```

Bản đóng gói dùng Linux/macOS `zip` có hỗ trợ symlink; trên Windows dùng PowerShell Compress-Archive. Script CI có ma trận Windows và macOS Intel; CI nêu trên đã đạt cả hai job và tải các gói lên Releases. Mã nguồn đã đẩy lên GitHub theo sự đồng ý của người dùng.

## Dữ liệu và bảo mật cục bộ

Dữ liệu lưu dưới thư mục `app.getPath('userData')` của Electron; xem đường dẫn trong Cài đặt. `workspace/workspace.json` lưu cấu hình và bản trước đó trong `.bak`, ghi qua tệp tạm rồi đổi tên. Cookie do Chromium quản lý trong các partition. Proxy credential/API token được lưu cục bộ, không dùng vault riêng; hạn chế quyền tài khoản máy và tránh chia sẻ cả thư mục dữ liệu. Clone chỉ sao chép cấu hình, không sao chép cookie. Xóa thông thường chuyển vào thùng rác và giữ dữ liệu để khôi phục; xóa vĩnh viễn trong thùng rác dọn session rồi bỏ cấu hình, không có undo.

Cookie export có thể chứa phiên đăng nhập: giữ tệp riêng tư. Xuất cấu hình JSON bỏ username/password proxy mặc định; cần nhập lại credential trên máy mới. CSV tránh tiền tố công thức khi xuất; giá trị có tiền tố đó có thể được thêm dấu `'` để spreadsheet không thực thi công thức.

API bật ở Cài đặt, token được tạo trên máy:

```text
GET  /v1/state
POST /v1/profiles
POST /v1/profiles/{id}/start
POST /v1/profiles/{id}/stop
POST /v1/workflows/{id}/run    body: {"profileIds":["..."]}
Authorization: Bearer <token từ Cài đặt>
```

API chỉ nghe `127.0.0.1`, cổng mặc định 32187. Không công bố ra mạng. Khi đổi cổng/token, listener được khởi động lại; lỗi cổng sẽ khôi phục cấu hình trước.
