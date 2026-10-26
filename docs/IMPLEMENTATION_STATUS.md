# Trạng thái triển khai và kiểm chứng 0.1.0

Yêu cầu ban đầu là toàn bộ chức năng GPM trên Windows và macOS Intel. Yêu cầu đó **chưa hoàn tất**; không thể suy ra máy chủ, engine tùy biến và toàn bộ hành vi từ các chuỗi trong một bộ cài Windows. Bản này cung cấp nền tảng độc lập để tiếp tục phát triển, không phải mã nguồn gốc đã khôi phục.

| Phạm vi | Đã viết | Đã kiểm chứng trong phiên |
| --- | --- | --- |
| F01/F03/F06: CRUD cấu hình, clone, bulk create, ghi chú/màu | Store, UI | Test lưu/reload, clone, validate và DOM tạo hồ sơ. Có ghim/lần chạy gần nhất và đổi nhóm/proxy hàng loạt; chưa có shortcut/owner. |
| F02/F07/F08: bảng tìm kiếm, nhóm, nhãn | Store, UI | DOM tương tác và cleanup tham chiếu. Có thùng rác/khôi phục/xóa vĩnh viễn; chưa có mọi cột hoặc kéo chọn. |
| F04/F09: phiên riêng và proxy | Electron browser service | Mã đã viết; runtime browser/proxy chưa chạy do host thiếu sandbox phù hợp. Không xác nhận chống rò rỉ DNS/fingerprint. |
| Cookie, cache, export/import | Electron session; JSON bundle, ExcelJS | Bundle roundtrip/rollback được test. Dialog tệp, Excel và session cookie cần smoke trên OS đích. |
| Tiện ích theo nhóm | Loader extension thư mục | Metadata và tham chiếu được test; extension thật chưa chạy. |
| Sắp xếp/đồng bộ cửa sổ | Electron/CDP | Chưa runtime. Đồng bộ giới hạn click, input, scroll document chính. |
| Tự động hóa | goto/wait/click/type/screenshot | DOM editor/validation được test; thực thi browser chưa chạy. |
| API | http.Server localhost + Bearer | Auth, reject Origin, định tuyến, token/password redaction được test với HTTP thật. |
| Windows/macOS x64 đóng gói | Electron Packager | Kiểm tra archive và binary architecture khi tạo gói. Chưa chạy gói trên OS đích; chưa ký/notarize. ASAR integrity digest cho gói macOS chưa nhúng khi build trên Linux (packager báo thiếu codesign); cần build/ký trên Mac trước khi phân phối chính thức. |
| Engine, fingerprint nâng cao, Firefox, cloud, role/sharing, GPM auth/license, UDP/route, plugin IPv6, GPM Automate, updater/AI | Chưa triển khai | Cần đặc tả/engine/backend hợp lệ và dữ liệu kiểm thử; không có cơ sở tuyên bố tương đương. |

## Kết quả ban đầu trên Linux (trước CI native)

- `npm test`: 18/18 đạt (15 lưu trữ/API, 3 DOM integration bằng jsdom).
- Kiểm tra cú pháp các module JS: đạt.
- Khởi động Electron trên Linux cloud: bị chặn trước khi mở app, `No usable sandbox`; SUID helper không có chủ sở hữu root và user namespace không dùng được. Không tắt sandbox.
- Smoke thật trong `scripts/smoke.mjs`: đã viết, chưa chạy thành công. Kiểm tra startup/IPC, isolation cookie, close/reopen và tự động hóa với fixture localhost trên máy có desktop/sandbox.
- CI Windows/macOS: mới tạo workflow, chưa chạy và chưa có kết quả.

## Nghiệm thu còn cần

1. Chạy `npm ci`, `npm test`, `npm run smoke` trên Windows x64 và macOS Intel có desktop; ghi lại OS/version/exit code. Test cookie isolation và xác thực proxy đúng/sai với proxy thử do người dùng quản lý.
2. Chạy các luồng browser, extension, native dialog, sync, automation và Excel với dữ liệu mẫu; phát hiện và sửa khác biệt nền tảng trước khi coi 0.1.0 là bản dùng ổn định.
3. Có đặc tả cho các nhóm trong FEATURE_MATRIX còn thiếu; ghi nhận input/output và trạng thái gốc bằng máy kiểm thử Windows, không suy đoán hành vi từ tên.
4. Với cloud/engine/plugin độc quyền: cần tài liệu, quyền tích hợp và backend/engine phù hợp hoặc chấp nhận thiết kế độc lập có phạm vi khác. Không dùng token trích từ binary làm credential.
5. Ký Windows và ký/notarize macOS khi phân phối chính thức. Gói ZIP chưa ký không phải installer phát hành đã nghiệm thu.

## Cập nhật sau CI Windows/macOS Intel

Run [40276302963](https://github.com/HoangAnh2k7/HoangAnh2k7/actions/runs/40276302963), commit `7023fef40f2779a5c8b69a25c6fa65b999a1b030`: cả hai job thành công. Mỗi job chạy 18/18 test, smoke Electron thật, đóng gói ZIP và upload Releases. Smoke xác nhận startup/IPC, cookie tách biệt, close/reopen, quy trình localhost và screenshot. Đã sửa lỗi startup: phải khởi tạo renderer bằng about:blank trước khi gửi lệnh Emulation/CDP.

Smoke chạy ứng dụng từ mã nguồn trên runner, chưa kiểm tra riêng việc người dùng giải nén và mở ZIP và chưa nghiệm thu mọi nhóm chức năng. Các giới hạn engine/fingerprint/cloud, chữ ký và tính tương đương GPM vẫn còn. Các gói tại Releases được build native ở từng OS; cảnh báo ASAR digest của bản cross-build Linux ban đầu không áp dụng cho gói macOS native mới.
