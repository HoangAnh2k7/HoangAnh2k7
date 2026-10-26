# Đối chiếu tài liệu, ảnh và video công khai

Mục tiêu: hiểu cách người dùng thực sự thao tác GPMLogin Global, thay vì chỉ đoán từ tên lớp trong chương trình. Ngày thu thập: 2026-10-26. Nguồn chính là Help/API được [portal của GPM](https://docs.gpmloginapp.com/) liên kết.

## Mức truy cập thực tế

| Nguồn | Đã đọc được | Chưa đọc được / giới hạn |
| --- | --- | --- |
| Help GPM | 33 trang hướng dẫn tiếng Việt; chỉ mục tài liệu; nội dung mô tả thao tác | Đây là lời mô tả của nhà phát hành, chưa phải chạy mẫu gốc để xác nhận side effect. |
| API docs | Hợp đồng 20 route, 26 trường hồ sơ, enum, default, phản hồi | Chưa gửi request đến GPM đang chạy. |
| Ảnh trong Help | Đã tải và xem 7 ảnh: một phần toolbar, Create/Quick action, proxy input, Connection, Hardware, Software, proxy library | Không khẳng định đã xem cả 14 ảnh trong chỉ mục. Ảnh proxy library mang tiêu đề **v0.1.1-beta**, ảnh tạo profile có Chrome147; không coi chúng là baseline pixel chính xác của mẫu5.1.2. |
| Trang Facebook được website GPM dẫn đến | HTTP200; tên/trang/mô tả công khai; bản HTML và hash đã lưu | HTML nhận được không có nội dung bài/video có thể phân tích: 32 JSON script, không có candidate story/video trong phạm vi parser đã dùng. Không tuyên bố đã xem video Facebook. |
| YouTube channel được website dẫn đến | Ghi nhận liên kết nguồn | Proxy từ chối CONNECT403. Không tải được trang kênh, phụ đề hay video; không có mốc thời gian đã xem. |
| Video người dùng cung cấp `5gyHikdZPOw` | Ghi nhận đúng video ID và liên kết | `https://youtu.be/5gyHikdZPOw` cũng bị CONNECT403. Không suy ra tiêu đề, nội dung hoặc kết quả từ ID. |

Một HTTP200 của trang Facebook không chứng minh truy cập được video. Một embed/thumbnail/link YouTube không chứng minh người phân tích đã xem video. Không dùng các snippet tìm kiếm không liên quan làm bằng chứng tính năng.

## Chỉ mục video cần đối chiếu tiếp

Các video sau được chính Help dẫn đến; tên chủ đề được lấy từ trang đặt link, **không phải tiêu đề video đã xác minh**:

| Chủ đề của trang hướng dẫn | Link | Trạng thái |
| --- | --- | --- |
| Đăng ký dùng thử | https://www.youtube.com/watch?v=ok17YJjv2wE | Chỉ nhận diện từ tài liệu; chưa xem |
| Extension | https://www.youtube.com/watch?v=Y0TKL90sW78 | Chỉ nhận diện từ tài liệu; chưa xem |
| Plugins | https://www.youtube.com/watch?v=tINp0ojhr5E | Chỉ nhận diện từ tài liệu; chưa xem |
| Private Server | https://www.youtube.com/watch?v=WaEWPXJbnlY | Chỉ nhận diện từ tài liệu; chưa xem |
| Video người dùng gửi | https://www.youtube.com/watch?v=5gyHikdZPOw | Truy cập YouTube trực tiếp bị proxy403; đã phân tích bản MP4 Drive riêng, xem VIDEO_OBSERVATIONS.md |

Playlist được Help dẫn đến gồm [hướng dẫn Global](https://www.youtube.com/playlist?list=PLpEwQxqRGbYlXaITaChGEZHLQvuZpNVAs). Việc link có trong Help chưa xác minh playlist đang tồn tại hoặc cùng build với binary.

## Cập nhật: bản video Drive đã phân tích

Người dùng đã cung cấp một bản MP4 qua Drive. Đã tải thành công và phân tích khung hình phủ timeline cùng249đoạnASR hỗ trợ. Báo cáo riêng: [VIDEO_OBSERVATIONS.md](VIDEO_OBSERVATIONS.md). Vì vậy, giới hạn YouTube403 ở bảng trên là **đường truy cập trực tiếp**, không còn nghĩa là chưa có nguồn video để đối chiếu. VideoDrive ghi GPM-Loginv3.0-stable, khác mẫuEXE5.1.2. Không đưa video/ảnh/transcript có dữ liệu tài khoản lên repo.

## Những điều thấy trực tiếp trên ảnh

Nguồn tạo profile: [Profiles](https://help.gpmloginapp.com/huong-dan-s-dung-gpm-login-global/profiles.md). Bản sao ảnh và SHA-256 nằm trong workspace riêng `round2/social/screenshots/manifest.json`; không đưa ảnh có dữ liệu proxy minh họa vào repo công khai.

### Khung tạo/sửa profile

- Giao diện sáng, nền trắng, đường viền xám nhẹ; accent xanh dương; thanh giải thích có viền xanh lá.
- Đầu trang có tên profile, chọn group, `Create random parameters` và `Create`; góc phải có đóng.
- **5 tab theo thứ tự nhìn thấy:** `Quick action`, `Connection`, `Hardware`, `Software`, `Cookies`.
- Nội dung form nằm bên trái; khung `Fingerprint summary` bên phải, có vùng cuộn riêng. Không phải một hộp thoại ngắn gồm tên, URL và proxy.
- Tab đang chọn có gạch xanh phía dưới. Một số lựa chọn dùng segmented buttons thay vì checkbox hoặc ô JSON.

### Quick action / proxy

- Chọn Chrome/Firefox, `Taskbar title`, `Startup URL`, proxy type; link chọn từ thư viện proxy và `Check proxy`.
- Nhập proxy bằng bốn trường `Host`, `Port`, `Username`, `Password` xếp hai cột.
- Có thiết lập cho đuôi tệp tĩnh đi ngoài proxy; ảnh không chứng minh lựa chọn này mặc định bật.
- Summary hiển thị browser/version, OS, user agent, proxy, language, timezone, WebRTC, geolocation, screen, Canvas/client rect/WebGL/audio/font.

### Connection

- WebRTC có `Base on IP`, `Fixed`, `Real`, `Disabled`.
- Checkbox timezone theo vị trí IP proxy; geolocation có `Prompt`, `Allow`, `Disabled`.
- Trường `Block port scan`, hướng dẫn tách port bằng dấu `;`.
- Tài liệu còn nêu DNS tùy chỉnh; phần không nằm trong crop ảnh không được xem là đã thấy trực tiếp.

### Hardware

- Screen resolution dropdown; Canvas có `Noise`, `Real`, `Block`; Client rect có `Noise`, `Real`.
- WebGL image có `Noise`, `Real`; WebGL metadata có `Masked`, `Real` và vendor/renderer dropdown.
- Audio, media masking, hardware concurrency, memory, Bluetooth, hide media devices, MAC address. Một số trường nằm dưới vùng cuộn.
- Không diễn giải kích thước cửa sổ desktop là `screen.width/height` và không coi các nút này đã thay đổi engine chỉ vì UI tồn tại.

### Software

- Chọn browser và version.
- OS phân biệt Windows, Mac Intel, Mac Apple Chip, Linux, Android.
- Cho phép sửa user agent bằng checkbox; Font Masked/Real; language theo IP; device name.
- Mac Intel và Apple Chip là hai loại riêng trong **OS giả lập**, không đồng nghĩa app chạy được trên mọi OS đó.

### Proxy library và navigation

Ảnh đầy đủ của proxy library là bản **0.1.1-beta**, chỉ dùng tham khảo cấu trúc:

- Sidebar tối bên trái, nội dung sáng bên phải; nhóm Main / Automation / Others.
- Profiles, Groups, Proxy, Extensions, Plugins, Trash; Automation, App store, Developer; Settings, Log, Support, About.
- Toolbar Create/Search/Refresh/Check/Copy/Delete; table có checkbox, Type, Information, Tags, Created time, Status, Actions.
- Footer có trang trước/sau, page input, records-per-page và tổng số.
- Không gán số pixel hoặc mọi mục sidebar của ảnh cũ thành thông số chắc chắn cho mẫu5.1.2. Binary mới còn có surface MCP/ChatBox và cập nhật khác.

## Cách dùng video khi truy cập được

Mỗi đoạn quan sát cần bản ghi: video ID, timestamp bắt đầu/kết thúc, version trong title bar, hệ điều hành, trạng thái ban đầu, thao tác, kết quả, thông báo lỗi và thay đổi dữ liệu. Không dùng toàn bộ video như một bằng chứng chung “đã giống”. Các đoạn ưu tiên:

1. Tạo profile và đi đủ năm tab.
2. Mở/đóng/clone, kiểm tra cookie còn và fingerprint đổi.
3. Delete cache, Trash/Restore và Permanent delete.
4. Nhập Excel/cookie, export/import profile và backup.
5. Proxy paste/check/rotate, extension theo group.
6. Đồng bộ hành động, chọn monitor, pause/resume, arrange.
7. Local/Private Server switching, quyền chia sẻ và trạng thái profile đang được dùng.

Nếu chỉ có video không khớp phiên bản, ghi khác biệt; không tự sửa tên phiên bản hoặc nhận hành vi cũ là chuẩn mới.
