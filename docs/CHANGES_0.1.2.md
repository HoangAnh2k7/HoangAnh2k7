# Profile Studio 0.1.2 — hồ sơ mở ra trang trắng

Ở bản 0.1.1, hồ sơ không có URL khởi động được mở bằng `about:blank`. Cửa sổ Electron lúc đó không có ô địa chỉ để người dùng đi tiếp. Trường hợp này không phải thiếu mã nguồn Chromium: engine Chromium đã nằm trong runtime Electron của gói ứng dụng.

Bản 0.1.2 thay trang trống bằng trang đầu cục bộ có ô địa chỉ/tìm kiếm. Trang đầu hiển thị được cả khi chưa có Internet. Có thể nhập URL HTTP/HTTPS, tên miền hoặc từ khóa tìm kiếm Google. URL có scheme không hỗ trợ hoặc chứa thông tin đăng nhập bị từ chối. Muốn mở trang web thì vẫn cần kết nối mạng/proxy hoạt động.

Menu **Điều hướng** cung cấp nhập địa chỉ, trang đầu, quay lại, tiến tới và tải lại. **Ctrl+L** trên Windows / **Cmd+L** trên macOS mở lại trang đầu để nhập địa chỉ; đây chưa phải thanh địa chỉ cố định hay trình duyệt nhiều tab hoàn chỉnh.

Giữ nguyên dữ liệu hồ sơ. Đóng ứng dụng cũ, giải nén toàn bộ ZIP mới vào thư mục khác rồi mở `profile-studio.exe` (Windows) hoặc `Profile Studio.app` (macOS Intel). Không cần tải mã nguồn Chromium hoặc cài Chrome riêng. Các gói vẫn chưa ký/notarize.

Kiểm thử mới tái hiện đúng hồ sơ không có URL: mở trang đầu, chặn `javascript:`, điều hướng đến trang localhost, rồi dùng Ctrl/Cmd+L trở lại ô nhập. CI còn giải nén ZIP, xác minh checksum và chạy lại các kiểm tra bằng executable trong chính gói đó. Không chỉ khởi chạy ứng dụng từ mã nguồn.

Chưa có engine fingerprint tùy biến của GPM. Phân tích bộ cài không khôi phục toàn bộ source Chromium tùy biến hoặc backend của sản phẩm gốc.

## Kết quả nghiệm thu

[CI 40325989067](https://github.com/HoangAnh2k7/HoangAnh2k7/actions/runs/40325989067), commit `eeb30db86e242155d99aee859d748f8b5603829e`: Windows x64 và macOS Intel đạt 21 test, smoke từ mã nguồn, đóng gói, kiểm checksum, giải nén và smoke lại bằng executable trong ZIP. Kiểm tra bao gồm hồ sơ với `startUrls: []`, nhập địa chỉ localhost và phím Ctrl/Cmd+L qua luồng input native Electron. Sự kiện bàn phím CDP không đi qua luồng menu native, nên kiểm tra phím tắt dùng `webContents.sendInputEvent`. Các lượt trước thất bại được giữ trong lịch sử Actions; chúng không được phát hành.
