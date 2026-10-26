# Phân tích video thao tác người dùng cung cấp

## Nguồn và cách đọc

Bản MP4 được người dùng chia sẻ qua Drive sau khi đường dẫn YouTube trực tiếp bị proxy chặn. Video dài **825,887 giây (~13:46)**, 1280×720, 30fps, có AAC audio. SHA-256: `ff8aeaa8ccaa77e7a9a25ecd5fbc7438df325c6d5c35e244504b57cb99b49127`.

Không đưa video, ảnh chứa tài khoản/proxy/license, transcript đầy đủ hoặc liên kết Drive riêng vào repository công khai. Các ghi nhận dưới đây bỏ tên tài khoản, key, địa chỉ/mật khẩu proxy và tên profile cụ thể.

Đã xem 7 contact sheet phủ toàn timeline ở bước15giây, sau đó xem các khung hình đầy đủ tại những mốc cần đọc control. Audio được giải mã bằng ffmpeg thành PCM16kHz mono, rồi chép lời máy bằng faster-whisper1.2.1 / multilingual-small CPUint8 (249 đoạn). ASR có lỗi từ và thuật ngữ; chỉ dùng hỗ trợ định vị nội dung, không lấy làm bản chép lời nguyên văn hay chứng cứ duy nhất. Các số/hotkey/extension quan trọng được đọc từ ảnh.

**Phiên bản trong video: thanh tiêu đề ghi `GPM-Login v3.0-stable`**, ngày trên desktop là22/12/2025; ví dụ browser142.0.7444.163. Mẫu EXE hiện phân tích tự khai `5.1.2-stable`, NativeAOT RTR16.0. Đây là hai mốc phiên bản khác nhau. Không dùng giao diện v3 để phủ định các view/field được phục hồi trong5.1.2, hoặc lấy nó làm pixel baseline cho5.1.2.

Liên kết YouTube người dùng nêu là https://www.youtube.com/watch?v=5gyHikdZPOw . Chưa tải được trực tiếp để xác minh byte video YouTube trùng bản Drive; những quan sát có timestamp trong báo cáo này thuộc **bản MP4 Drive** đã hash ở trên.

## Timeline quan sát

Mốc là vị trí khung hình/đoạn hướng dẫn; các khoảng có thể xê dịch vài giây quanh thao tác. Không biến lấy mẫu15giây thành khẳng định đã thấy mọi click liên tục.

| Mốc | Điều thấy trên khung hình và lời hướng dẫn tương ứng | Ý nghĩa cho bản thay thế |
| --- | --- | --- |
| 00:00–00:40 | Popup Enter license xuất hiện trên shell; sau bước áp dụng chuyển sang chọn nơi lưu dữ liệu | Startup là một state machine, không vào bảng profile rỗng ngay trong mọi trường hợp. Không ghi nhận hoặc sao chép key hiển thị. |
| 00:45–01:20 | Hộp chọn local database/folder, browse đường dẫn và áp dụng | Profile storage độc lập với thư mục cài app. Cần phát hiện thiếu/đổi đường dẫn và cảnh báo phù hợp. |
| 01:30–02:20 | Settings gồm lưu trữ/compression, license, ba ngôn ngữ, theme, các cờ browser, defaults, automate path, proxy check, extension | Bản0.1 có trang cài đặt quá ít. Nhiều cờ làm thay đổi luồng chạy, không chỉ lưu cho đẹp. |
| 02:30–03:05 | Sidebar có thể mở rộng; trang Profiles rỗng rồi trang quản lý nhóm với tên và thứ tự | Cần collapsed/expanded navigation, empty state và group ordering. |
| 03:15–04:10 | Thư viện proxy; hộp bulk import có loại proxy và textarea; sau import/check bảng nhiều hàng có trạng thái, địa lý | Cần phân tích raw proxy theo dòng, trạng thái từng mục, batch progress; không chỉ CRUD một proxy và trả IP. Trang nhà cung cấp proxy trong video không phải bằng chứng thuật toán GPM. |
| 04:15–04:45 | Trang công cụ có backup/restore/rename-folder/resource-fixer/chuyển64bit; resource dialog liệt kê nhiều bản Chromium | Engine/resources có vòng đời riêng. Không mặc định engine Electron đang dùng chính là engine GPM được chọn. |
| 05:00–05:20 | Tạo theo số lượng: count, browser version và proxy list. Sau đồng ý bảng tăng từ1 lên11 profile | Count10 tạo10hồ sơ mới; phải kiểm tra ID/folder/config độc lập. UI v3 không chứng minh form bulk của5.1.2 có cùng trường/thứ tự. |
| 05:30–06:30 | Sort, chọn/quét nhiều hàng, chọn một hàng, ghi chú, mở Edit profile; Hardware và summary bên phải | Cần hành vi selection, inline editing và batch eligibility. Edit v3 có4tab Quick action/Connection/Software/Hardware; không đồng nhất với5tab ở Help Global hiện hành. |
| 06:45–07:20 | Chọn10profile rồi Check proxy; dialog liệt kê từng profile, Checking/OK và checkbox tự đóng profile có proxy lỗi | Profile proxy checking là task theo tập chọn, có policy khi lỗi. Không chỉ gọi một API check trên proxy library. |
| 07:30–08:20 | Bulk reset/đặt proxy bằng danh sách; bảng từng profile cập nhật proxy; check lại | Gán proxy theo danh sách và thứ tự phải nghiệm thu riêng. Video không đủ chứng minh quy tắc khi thiếu/thừa proxy hoặc input lỗi. |
| 08:30–09:00 | Hộp đổi browser version; mở thử một profile làm hiện cửa sổ browser riêng và trạng thái Mở→Đóng | Engine version update cần validation và quản lý data compatibility; không sửa nhãn version trên UI rồi coi là đổi trình duyệt. |
| 09:30–10:30 | Arrange window: size/arrange mode, rows/columns, scale, lựa chọn phạm vi, preview, sắp profile đã mở hoặc mở+rồi sắp tập chọn. Chọn2hàng/5cột và10profile hiện thành lưới | Cần phân biệt open-and-arrange với arrange-existing; scale và viewport/window geometry không phải cùng khái niệm. |
| 10:45–12:20 | Sync actions: child-window ratio, tự sắp/nhập kích thước/sắp thủ công, startupURL, thêm extension, Bắt đầu/Tạm dừng/Dừng. Có giai đoạn bố trí lại. Nhiều cửa sổ nhận thao tác nhập và xuất hiện gợi ý trên Google | Cần state start/pause/resume/stop, quản lý kích thước/monitor và tập chọn. Video chứng minh một ví dụ nhập đồng thời; chưa chứng minh mọi iframe/canvas/native dialog hoặc độ chính xác mọi sự kiện. |
| 12:00 | Thanh sync rút gọn ghi hotkey `Shift+Alt+P`, `Shift+Alt+R`, `Shift+Alt+S` và trạng thái đồng bộ | Có keyboard-shortcut surface ở v3, cần đối chiếu5.1.2 trước khi coi bindinghotkey bất biến. |
| 12:30–13:45 | Hướng dẫn cài GPM Automate Runtime, liên kết phần mở rộng **`.gpmlaunch`** trong Windows Properties/Open with, rồi mở script trong runtime riêng | Năm bước JSON của app0.1 không tương thích runtime hoặc package script này. Lời ASR đọc sai extension; ảnh xác nhận `.gpmlaunch`. Không chạy script ví dụ hoặc nội dung tự động hóa được quảng bá. |

## Khác biệt quan trọng giữa ba nguồn

| Hạng mục | Video v3.0 | Help Global / mẫu5.1.2 | Quy tắc phân tích |
| --- | --- | --- | --- |
| Giao diện tạo/sửa | Popup tối,4tab ở khung06:15 | Help có5tab, Hardware trước Software, Cookies riêng; binary có InitCookie và surface phong phú hơn | Ghi hai baseline, chưa giả định layout5.1.2 từv3 |
| Settings/lưu trữ | Folder PC/AmazonS3 và compression trong video | Help/binary hiện hành có PrivateServer, local/cloud DB switch, MCP, các settings khác | Giữ version tag ở từng ca thử |
| Automation | Cài runtime riêng, `.gpmlaunch` | Help Global tiếp tục nêu Automate là sản phẩm riêng | Tương thích cần runtime/package contract, không phải một nút mở trang |
| Browser examples | Chrome142, ngày ghi hình2025 | Help có147; danh mục binary hiện có153 | Engine được cập nhật độc lập; không suy browserexample=appversion |

## Những điều video này không xác nhận

- Thuật toán Canvas/WebGL/audio/client-rect noise, seed, TLS/DNS/WebRTC trên mạng thực.
- Cookie isolation hoặc clone cookie trên hai profile đã đăng nhập; chưa có so sánh dữ liệu trước/sau đủ để chứng minh.
- Export/import ZIP/Excel thành công và schema toàn bộ package.
- Cloud lock, quyền chia sẻ/thu hồi, đồng bộ dữ liệu và lỗi mạng.
- Tương đương toàn bộ ứng dụng5.1.2, hoặc hành vi trên macOS Intel.

Video giúp hoàn thiện **flow và trạng thái UI**; cần dữ liệu/profile thử và thực thi gốc được kiểm soát để chốt các contract còn lại. Các kết luận thuật toán không được suy từ việc nhiều cửa sổ mở được hoặc có các nút fingerprint.

## Bổ sung kiểm tra chi tiết

Đợt đọc chéo lời ASR và các khung hình đầy đủ dưới đây bổ sung những điểm dễ làm sai khi dựng bản thay thế. Mọi hàng đều thuộc **video v3.0-stable**; chỉ được coi là contract của mẫu5.1.2 sau khi đối chiếu binary/runtime tương ứng. Không đưa ảnh gốc hoặc transcript riêng tư vào repository.

| Mốc | Ghi nhận và độ tin cậy | Ảnh hưởng đến đặc tả |
| --- | --- | --- |
| 01:22–01:48; khung02:05 | Người hướng dẫn nói sao lưu/thay máy bằng thư mục lưu trữ riêng; khung Settings ghi việc đổi thông tin lưu trữ cần khởi động lại app và đường dẫn không được chứa ký tự tiếng Việt. **Cao về chữ hiển thị, trung bình về khả năng sao chép sang máy khác vì video không thực hiện phục hồi. Legacy-only.** | Tách app-install directory khỏi profile-storage root; có state đổi đường dẫn/restart. Quy tắc đường dẫn v3 không tự động áp cho5.1.2 hoặc được hiểu là Windows/macOS không hỗ trợ Unicode. Không khẳng định cookie encryption di chuyển máy đã hoạt động. |
| 01:48–02:17; khung02:05 | Checkbox được chọn ghi rõ **“Tự động xóa cache khi đóng”**, không phải xóa khi khởi động. Các checkbox mở tab phiên trước, tự đổi kích thước cửa sổ theo profile và không dùng thùng rác là các tùy chọn riêng. **Cao, đọc trực tiếp ảnh. Legacy-only.** | Cần kiểm tra hook lúc đóng cửa sổ/profile. Cache-on-close không đồng nghĩa clear toàn bộ storage/cookie. Không suy trạng thái checkbox là bằng chứng filesystem đã được dọn. |
| Khung02:05 | Compression có lựa chọn mặc định/7Z; lời mô tả UI nói nó được dùng cho Import/Export/Backup/Restore và nén profile khi đưa lên cloud nếu sử dụng. **Cao về UI, chưa xác minh format package thực tế. Legacy-only.** | Export/import GPM không thể được coi tương thích chỉ vì bản thay thế xuất một JSON cấu hình. Cần mẫu archive và kiểm tra restoration đầy đủ. |
| Khung02:05 | Settings có **hai mô hình extension**. Extension mặc định được cài trực tiếp vào thư mục mỗi profile khi tạo, dung lượng profile tính cả extension. Extension dùng chung chỉ cài một lần trên máy local để giảm dung lượng; lời UI lưu ý profile nhập sang máy khác cần cài lại extension dùng chung. **Cao, chữ UI đọc được. Legacy-only.** | Cần phân biệt extension do profile sở hữu với tham chiếu tài nguyên shared của máy. Clone/export/backup và thay máy có contract khác nhau; một global group-loader duy nhất chưa tái tạo đủ. Chưa chạy thử hai mô hình để xác nhận chi tiết copy/symlink/lifetime. |
| Khoảng08:20–08:27; khung08:20 | Phần hướng dẫn của hộp `Set proxy` nêu cách hủy proxy/dùng IP máy bằng chuỗi literal **`null`**. ASR khoảng08:19 đọc sai từ này. **Cao về helper text, trung bình về thao tác diễn ra vài giây sau. Legacy-only.** | Bulk proxy parser có lệnh văn bản đặc biệt; phân biệt `null` dạng chuỗi trong textarea, JSON null trong API, empty string và URI proxy. Không suy quy tắc mapping khi số dòng ít hơn/nhiều hơn số profile từ một ví dụ. |
| Khoảng06:43–06:46; đối chiếu toolbar trong video | ASR có cụm dễ hiểu thành xuất lịch sử web, nhưng toolbar đọc được là **Export cookies** bên cạnh Export profiles. **Cao về nhãn UI; đây là sửa lỗi suy luận từ ASR. Legacy-only.** | Không thêm tính năng “history export” vào danh sách đã thấy chỉ dựa lời chép máy. Cookie export và lịch sử là hai đối tượng dữ liệu khác nhau. |
| Khung10:45; trình diễn11:00–12:15 | Hộp Sync tự mô tả cơ chế mô phỏng thao tác cửa sổ chính; yêu cầu các cửa sổ đã tải xong, nội dung hiển thị giống nhau; có lưu ý có thể không hoạt động với touchpad và tốt nhất khi scale màn hình100%. **Cao về cảnh báo UI. Legacy-only.** | Phải đưa layout/DPI/loaded-state vào nghiệm thu sync; không lấy một lần nhập đồng thời làm bằng chứng mọi event, iframe, canvas hoặc touchpad đều hoạt động. Cảnh báo này cũng cho thấy sản phẩm gốc không tự cam kết chính xác tuyệt đối trong mọi môi trường. |
| Khung11:00 và12:15 | Nhiều cửa sổ Google hiển thị ngôn ngữ khác nhau. **Cao về hình ảnh; nguyên nhân chưa biết. Legacy-only.** | Chưa chứng minh locale đó khớp địa lý proxy, do fingerprint random, setting hay nội dung Google lựa chọn. Muốn kết luận alignment phải kiểm tra IP/location/header/navigator/timezone từng profile trong cùng ca thử. |
| 12:30–13:45 | Video cài/chọn ứng dụng mặc định cho `.gpmlaunch` và mở package trong GPM Automate Runtime. Không thấy một tác vụ tự động hóa có tiêu chí đầu/cuối và kết quả hoàn tất được kiểm tra. **Cao về việc mở Runtime, chưa xác minh script chạy thành công. Legacy-only.** | Contract file association/package/runtime đã có bằng chứng UI; engine thực thi script, cú pháp, lỗi, concurrency và đầu ra vẫn cần điều tra riêng. Không đánh dấu “Automate tương thích” vì một cửa sổ Runtime mở được. |

Tóm lại, video bổ sung các lựa chọn lưu trữ, vòng đời cache và extension, parser bulk proxy, điều kiện sync và file association của một phiên bản cũ. Các ghi nhận này tăng độ sát về hành vi và phát hiện các nhầm lẫn từ ASR; chúng không phục hồi thuật toán fingerprint hay chứng minh bản thay thế tương đương100% mẫu5.1.2.
