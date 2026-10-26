# Profile Studio 0.1.1

Bản này áp dụng hai khác biệt hành vi đã tìm thấy trong [phân tích GPM](analysis/REANALYSIS_REPORT.md). Chưa bổ sung browser engine, fingerprint hoặc cloud của GPM.

- **Chỉ xóa cache**: trong menu ⋯ của hồ sơ, chọn mục này rồi xác nhận. Cần đóng hồ sơ trước. Chỉ dọn HTTP cache qua Electron; giữ cookie, local storage, IndexedDB, service-worker Cache Storage và cấu hình hồ sơ. Mục **Xóa dữ liệu trình duyệt** vẫn dùng để xóa toàn bộ dữ liệu web.
- Chặn mở hồ sơ trong lúc dọn cache/dữ liệu; nhả khóa kể cả khi thao tác thất bại. Đây là cơ chế bảo vệ của Profile Studio, chưa đối chiếu cơ chế khóa nội bộ GPM.
- **Xóa nhóm**: cần chuyển các hồ sơ ra khỏi nhóm hoặc xóa vĩnh viễn chúng trước. Hồ sơ trong thùng rác vẫn giữ nhóm để khôi phục, nên cũng chặn xóa nhóm; giao diện hiển thị riêng số hồ sơ trong thùng rác. Chính sách bảo toàn quan hệ với hồ sơ đã lưu trữ là lựa chọn triển khai của Profile Studio; tài liệu GPM chưa đủ để chốt riêng trường hợp thùng rác.
- Không đổi định dạng dữ liệu hoặc di chuyển nơi lưu. Bản 0.1.0 vẫn được giữ ở release riêng.

Kiểm tra: 21 test lưu trữ/API/giao diện đã đạt trên cloud. Smoke Electron được mở rộng để tạo HTTP cache thật bằng trang localhost, kiểm tra cache đã có rồi bị xóa, cookie/local storage giữ sau mở lại, cache của hồ sơ thứ hai giữ nguyên và từ chối dọn khi hồ sơ đang mở. Windows x64 và macOS Intel đều đã đạt 21 test và smoke Electron trong [CI 40319589492](https://github.com/HoangAnh2k7/HoangAnh2k7/actions/runs/40319589492); các kiểm tra này không chứng minh tương đương toàn bộ GPM.
