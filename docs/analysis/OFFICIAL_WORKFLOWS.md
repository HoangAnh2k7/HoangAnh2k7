# Đặc tả vận hành từ tài liệu chính thức GPM Login Global

Phạm vi: nghiên cứu tài liệu công khai để tái dựng luồng sử dụng sát phần mềm mẫu nhất. **Tài liệu này mô tả điều nhà phát hành công bố; không thay thế quan sát runtime và không chứng minh tương đương 100%.** Không đăng nhập tài khoản, không gọi backend vận hành, không chạy bộ cài GPM, không lấy credential từ binary.

## 1. Nguồn và mức chứng cứ

Nguồn hiện hành được portal [docs.gpmloginapp.com](https://docs.gpmloginapp.com/) liên kết trực tiếp:

- [Help GPM Login Global](https://help.gpmloginapp.com/): trả Markdown công khai; chỉ mục [llms.txt](https://help.gpmloginapp.com/llms.txt).
- [Local API](https://api-docs.gpmloginapp.com/): trang HTML chứa đặc tả `SECTIONS`, `ProfileApiDto`, enum và ví dụ. Đọc tĩnh, không thực thi script từ site.
- [Tài liệu cũ](https://duys-organization-7.gitbook.io/gpm-login-document): portal gắn nhãn **GPMLogin v4 (Legacy)**. Chỉ lấy chỉ mục để nhận diện; không trộn các route/vận hành v4 vào đặc tả Global hiện hành.

Đã tải 33 trang Markdown tiếng Việt của Help thành công. Mỗi bản sao có URL, thời điểm UTC, SHA-256, kích thước trong `/workspace/gpm-analysis/round2/docs/sources.json`. Bản gốc ở `pages/*.md`; `api-home.html` và `api-route-index.json` lưu nguồn/spec API. `screenshots.json` lưu 14 liên kết ảnh với ngữ cảnh. `media-links.json` lưu các video/playlist được chính Help dẫn đến.

Các nguồn hiện hành không ghi một phiên bản build duy nhất trùng chắc chắn `5.1.2-stable`. Ví dụ API dùng Chrome137 và sender `GPMLogin Global v1.0.0`, ảnh hướng dẫn có Chrome147, trong khi mẫu binary có dấu vết engine153. Cần coi ví dụ minh họa là ví dụ, đối chiếu từng điểm với mẫu/runtime trước khi đặt tên “tương thích bản5.1.2”.

## 2. Cấu trúc làm việc và giao diện

Nguồn: [Giới thiệu giao diện](https://help.gpmloginapp.com/huong-dan-s-dung-gpm-login-global/gioi-thieu-qua-giao-dien-va-tinh-nang-tung-thanh-phan.md).

Nhà phát hành mô tả các thành phần sau trên màn hình chính:

1. Tiến trình chạy ẩn; chuyển Light/Dark; chọn English/Vietnamese/Chinese.
2. Thông báo update app và engine; `Fix` tải lại bản mới, `Update` nâng phiên bản.
3. Chuyển Local sang Cloud/Private Server.
4. Chọn profile bằng checkbox hoặc quét chuột; bỏ lọc; reload; chọn cột Tag/LastRun/Note.
5. Tạo một profile, bulk create, import; tìm theo tên; lọc nhóm; sort A–Z/mới–cũ/lần mở gần nhất.
6. Export profile/cookie; bulk edit group/name/proxy/browser version/startup URL; copy name/ID.
7. Tool: delete cache, check proxy, sync action, arrange browser windows.
8. Menu từng profile: pin, edit, clone, color, import cookie, share (Private Server), shortcut desktop, mở folder, chạy remote port, copyID.

Danh sách trên là chức năng được tài liệu nêu; vị trí pixel, kích thước, thứ tự sidebar và trạng thái hover/focus phải đối chiếu ảnh gốc hoặc runtime. Không nên chọn giao diện tối tự thiết kế rồi gọi là giống GPM. Ảnh tổng thể chính thức: `screenshots.json`, id `gioi-thieu-qua-giao-dien-va-tinh-nang-tung-thanh-phan-1`.

## 3. Luồng tạo hồ sơ — form nhiều phần, không phải vài ô chung

Nguồn: [Profiles](https://help.gpmloginapp.com/huong-dan-s-dung-gpm-login-global/profiles.md).

### Khung tạo

Tên + group, nút `Create random parameters`, các phần bên trái/nội dung và **Fingerprint summary** bên phải luôn cập nhật trước khi Create. Hai cách tạo: `Add New` và `Bulk Create`.

| Phần | Trường/chế độ tài liệu nêu | Hành vi cần nghiệm thu |
| --- | --- | --- |
| Quick action | Browser, Taskbar Title, Startup URL | Chrome cho nhiều startup URL; tài liệu UI nói cách nhau khoảng trắng và Firefox không mở nhiều URL đồng thời. API nói startup_urls xuống dòng: phải giữ đây là khác biệt parser/UI, không tự đồng nhất. |
| Proxy | None, HTTP, SOCK4, SOCK5, Route Proxy, Select from proxy library; host/port/user/password | Paste raw proxy vào Host tự phân tách. Proxy không auth để trống user/pass. Có Check proxy. |
| Static-file bypass | Cho file tĩnh đi trực tiếp không qua proxy | Tài liệu có chức năng này; nó chủ động dùng IP máy thật. Cần UI rõ ràng và kiểm thử mạng, không bật âm thầm. |
| Connection / WebRTC | Base on IP, Fixed, Real, Disabled | Base on IP dùng IP proxy; Fixed cần publicIP; Real dùng IP thật; Disabled tắt WebRTC. Gọi chung một policy disable_non_proxied_udp không tương đương cả4mode. |
| Timezone | Theo IP hoặc cố định | Theo IP phải lấy đúng vị trí IP proxy; cố định phải giữ IANA timezone. |
| Geolocation | Prompt, Allow, Disabled; theo IP | Prompt là luồng xin quyền, không tương đương luôn từ chối. |
| Port protection / DNS | Danh sách cổng ngăn bởi `;`; Custom DNS | Mẫu tài liệu nêu3389;5900;19995;9495;9496. Chưa xác minh semantics ở engine. |
| Hardware | Screen; Canvas/WebGL Image/Audio mode; ClientRect; WebGL vendor+renderer; CPU threads; RAM | Cần giá trị nhất quán và ổn định theo profile. Chỉ lưu một chuỗi seed không chứng minh engine thực thi. |
| Media | Masked media devices, Bluetooth, Hide Media Devices; MAC | Có các tùy chọn khác nhau; không nên gộp thành một permission deny. |
| Software | Browser Chrome/Edge/Opera/Brave/Firefox + version; OS Windows/MacIntel/MacARM/Linux/Android; UA auto/manual; font masked/real; language theo IP/manual; device name | UA tự khớp browser+OS. Tạo mới engine và “giả lập OS” khác với OS host hỗ trợ chạy app. |
| Cookies | JSON ngay khi tạo | Dữ liệu phải được nhập trước khi trang đầu truy cập và được giữ khi mở lại. |

**Các mô tả “an toàn”, “qua mặt”, “trust” trong nguồn là tuyên bố của nhà phát hành, không phải kết quả kiểm chứng của nghiên cứu này.** Không dùng số chế độ hoặc số trường để suy ra tỷ lệ tương đương engine.

### Bulk create

- `By Quantity`: số lượng, prefix, danh sách mỗi proxy một dòng, browser version; tài liệu không giới hạn số lượng cứng nhưng khuyên chia lô vừa phải.
- `From Excel File`: nhập theo mẫu ảnh. UA có thể để trống để GPM tự tạo theo browser. Cần đọc tệp mẫu Excel gói cài để xác định header thật, không thay bằng schema CSV riêng rồi tuyên bố tương thích.
- Định dạng được mô tả: `host:port`, `host:port:user:pass`; SOCKS có tiền tố `socks4://`/`socks5://`, ví dụ có cờ UDP cuối `:True`/`:False`. Đây không phải chỉ một URL chuẩn mà `new URL()` xử lý hết.
- Route-provider prefixes trong bảng Help: `tm`, `tin`, `kiot`, `rai`, `zl`, `fproxy`, `proxyvn`, `topproxy`, `mproxy`, `vnproxy`, `sieutoc`, `m2p`, `clp`, `2proxy`, `net`, `1ip`, `rota`. Dạng `provider://API:True|False`. Chưa gọi dịch vụ, chưa có đặc tả phản hồi từng nhà cung cấp.

## 4. Những khác biệt hành vi quan trọng cần sửa trong bản thay thế

| Hành vi gốc theo tài liệu | Hiện trạng bản nền tảng0.1 đọc từ source | Kết luận |
| --- | --- | --- |
| Clone giữ dữ liệu cookie + extension và **thay fingerprint** | `Store.cloneProfile` chỉ copy cấu hình; session mới rỗng, chưa có engine fingerprint tương đương | Đây là khác biệt chức năng lớn, không phải chi tiết UI. Cần snapshot dữ liệu khi profile đóng, identity mới và cơ chế seed engine đúng. |
| `Delete cache` không ảnh hưởng cookie | `Browsers.clear` gọi `clearStorageData` rồi `clearCache`, UI nêu xóa dữ liệu | Phải có hành động riêng clearCache-only; không đổi tên thao tác xóa cookie thành Delete cache. |
| Restore trả nguyên fingerprint/cookie/cache/login/history | Archive hiện giữ profile/session và restore ID | Cần golden test cấu hình+cookie+history+extension; test Store restore đơn thuần chưa đủ. |
| Xóa group cần xử lý profile trong group trước | Store hiện tự bỏ groupId khỏi profile | Khác policy. Chặn xóa group đang chứa profile, hoặc có thao tác chuyển nhóm rõ ràng trước khi xóa. |
| Proxy library có bulk paste, tag, filter, status+ping | UI hiện CRUD từng proxy, check IP, không tag proxy | Cần schema tag/status/latency và kiểm tra theo lô với kết quả từng mục. |
| Ngôn ngữ và timezone tự theo IP proxy | Bản nền tảng chỉ giá trị thủ công | Cần provider geolocation có nguồn và kiểm thử, không lấy IP máy host rồi gán cho proxy. |
| API GPM route/envelope/default-port/no-token | Bản nền tảng custom `/v1`, port32187, Bearer token | Không tương thích drop-in. Nếu thêm compatibility mode, giữ khác biệt an ninh được công bố và thiết kế rõ ràng. |
| Startup nhiều tab, restore previous session, bookmarks | Bản nền tảng tạo cửa sổ con cho mỗi startupURL, chưa có tab/restore/bookmarks | Cần tách khái niệm tab/cửa sổ/profile và lưu phiên. |
| Nhiều engine/version và giả lập OS riêng | Dùng duy nhất Electron engine | Thay UA/viewport không phải thay browserversion/OS. |

Các dòng trên là đối chiếu code đã đọc với tài liệu công khai, không khẳng định thuật toán binary gốc đúng mọi lời mô tả.

## 5. Groups, proxy, extension, trash, plugins

- [Groups](https://help.gpmloginapp.com/huong-dan-s-dung-gpm-login-global/groups.md): CRUD; trước xóa group phải move hoặc xóa hết profile bên trong.
- [Proxies](https://help.gpmloginapp.com/huong-dan-s-dung-gpm-login-global/proxies.md): bulk paste, check selected/all, Live/Dead và ping ms, gắn/tag-filter/clicktag, sửa hoặc xóa nhiều; proxy nằm trong library để chọn khi tạo profile.
- [Extension](https://help.gpmloginapp.com/huong-dan-s-dung-gpm-login-global/extension.md): Chromium có From URL (Chrome Web Store), From device `.crx`/`.zip` hoặc folder; bật/tắt toàn cục/theo group. Firefox quản lý qua `about:addons`, có thể clone hoặc sync cài nhiều profile. Không coi loader extension Electron folder-only là đủ.
- [Trash](https://help.gpmloginapp.com/huong-dan-s-dung-gpm-login-global/trash.md): soft-delete giữ local folder; restore nguyên dữ liệu trình duyệt.
- [Plugins](https://help.gpmloginapp.com/huong-dan-s-dung-gpm-login-global/plugins.md): IPv6 Creator cần router+OS có IPv6; Cleaner dọn temp/cache/log; Backup đóng gói toàn bộ profile và phục hồi login; Rename Profile Folder đồng bộ tênfolder theo tênprofile. SDK plugin được Help nói đang hoàn thiện, chưa có hợp đồng đầy đủ công khai tại nguồn này.

## 6. Automation và cloud không chỉ là nút giao diện

[Automation](https://help.gpmloginapp.com/huong-dan-s-dung-gpm-login-global/automation.md) xác định **GPM Automate là phần mềm riêng**: script/drag-drop, tab, DOM, extraction, điều kiện/vòng lặp, song song/tuần tự, log/progress/error. Tài liệu dẫn [docs.gpmautomate.com](https://docs.gpmautomate.com/) và marketplace [app.gpmautomate.com](https://app.gpmautomate.com/). Chưa điều tra toàn bộ ngôn ngữ/định dạng Automate trong nhánh nghiên cứu này. Năm bước JSON độc lập của bản0.1 không thể gọi là chạy scriptGPM.

[Private Server](https://help.gpmloginapp.com/huong-dan-s-dung-gpm-login-global/tinh-nang-nang-cao-private-server-luu-du-lieu-len-cloud.md) mô tả admin chia sẻ từng profile/cảgroup, phân proxy theo thành viên, thu hồi quyền, owner/current-user/active-state; storage PC/LAN, VPS, Hosting+Domain, S3/DigitalOcean, NAS. Đây là hợp đồng đồng bộ+khóa+quyền ở backend; không thể thay bằng thêm trường serverURL mà coi đã hoạt động. Chưa đăng nhập, không gọi endpoint service và không dựng license/credential giả.

[Settings](https://help.gpmloginapp.com/huong-dan-s-dung-gpm-login-global/setting.md): General có activation license, GPUusage, PrivateServerURL, LocalStorage, ProxyCheckServer. Browser có clearcache, restore previous session, startupURLs, bookmarks theo dòng `Name|URL`, default fingerprint modes. API gateway hiển thị LocalAPIURL.

## 7. Hợp đồng Local API hiện hành

Nguồn: [API docs](https://api-docs.gpmloginapp.com/); bảng máy đọc tại `api-route-index.json` gồm20routes và26profilefields. Chưa gửi request đến API GPM đang chạy.

### Kết nối, phản hồi và phân trang

- Base: `http://localhost:9495/api/v1` hoặc loopback127.0.0.1. Nếu port bận, tài liệu nói chọn8000–10000 và ghi `http.port` trong local appdata.
- Theo tài liệu không yêu cầu token. Đây là mô tả compatibility, không phải bằng chứng localhost tự nó chống được request từ trang web. Không tự ý bỏ bảo vệ của API bản thay thế mà không có thiết kế compatibility rõ ràng.
- Envelope: `{success,data,message,sender}`. `sender` ví dụ là tên+version, không nên giả danh GPM trong app độc lập.
- List query: `page=1,page_size=30,search,sort`; sort0newest,1oldest,2nameAZ,3nameZA.
- List payload: `{current_page,per_page,total,last_page,data:[...]}`. Profile list không cófingerprint; GETone cófingerprint.
- Enum có thể là integer hoặc tên chuỗi, không phân biệt hoa/thường. Null/omit khi create dùngdefault; null/omit khi update giữ nguyên.

### Các route công bố

| Method | Path (sau /api/v1) | Điểm cần giữ |
| --- | --- | --- |
| GET | /profiles | Phân trang; list nhẹ khôngfingerprint |
| GET | /profiles/{id} | Chi tiết kèmfingerprint |
| POST | /profiles/create | Chỉ name bắt buộc; mặc định tự sinhfingerprint |
| POST | /profiles/update/{id} | Patch; omit/null giữ nguyên |
| GET | /profiles/delete/{id} | mode=soft mặcđịnh, hard xóadisk |
| GET | /profiles/start/{id} | Query remote_debugging_port/window_scale/window_pos/window_size/skip_proxy_check/addition_args |
| GET | /profiles/stop/{id} | Đóng profile |
| GET | /browsers/versions | chromium/firefox versions |
| GET | /groups | Phântrang |
| GET | /groups/{id} | Chitiết |
| POST | /groups/create | name,sort_order |
| POST | /groups/update/{id} | name, sort_order chỉ áp dụng >0 |
| GET | /groups/delete/{id} | Xóagroup |
| GET | /proxies | Phântrang |
| GET | /proxies/{id} | Chitiết |
| POST | /proxies/create | raw_proxy |
| POST | /proxies/update/{id} | raw_proxy |
| GET | /proxies/delete/{id} | Xóa |
| GET | /extensions | Array không phântrang |
| GET | /extensions/update-state/{id} | active bắtbuộc; applied_group_ids comma-separated, omit=global |

Start reply có `profile_id`, `driver_path`, `remote_debugging_port`, `websocket_debugging_url`, `addition_info` gồmprocess_id/profile_name/window_handle/exec_time. Nếu đã mở thì trảcache, không khởiđộng lại. Không thể điền websocketURL giả khi engine không cung cấpCDP.

###26profilefields công bố

`name`, `group_id`, `raw_proxy`, `bypass_proxy_extensions`, `browser_type`, `browser_version`, `os_type`, `custom_user_agent`, `task_bar_title`, `webrtc_mode`, `fixed_webrtc_public_ip`, `port_protect`, `geolocation_mode`, `canvas_mode`, `client_rect_mode`, `webgl_image_mode`, `webgl_metadata_mode`, `audio_mode`, `is_masked_media`, `font_mode`, `timezone_base_on_ip`, `timezone`, `is_language_base_on_ip`, `fixed_language`, `startup_urls`, `note`.

Enum theo tài liệu:

- browser1chrome,2firefox,3edge,4opera,5brave.
- OS1Windows,2macOSIntel,3macOSARM,4Linux,5Android.
- WebRTC1basedIP,2fixed,3real,4disabled.
- geolocation1allow,2prompt,3block.
- canvas1noise,2real,3block.
- clientRect/WebGLimage/audio1noise,2real.
- WebGLmetadata/font1masked,2real.

`bypass_proxy_extensions` được mô tả là domain bypass trongAPI, nhưng tên trường và UI static-file bypass gợi cách xử lý có thể khác. Cần kiểm tra binary/runtime trước khi kết luận extension hay domain matching.

## 8. Ảnh/video chính thức và mức đã truy cập

Đã lấy được URL và ngữ cảnh screenshot từ trangHelp; nghiên cứu này không tự suy ra mọi màu/pixel từ text. Parent/root nhận `screenshots.json` để tải và xem ảnh gốc.

Video được chính tài liệu dẫn đến (mới đọc link+title trong Help, **chưa xem video/chưa đọc transcript**):

- [Thêm Extension trên GPM Login Global](https://www.youtube.com/watch?v=Y0TKL90sW78).
- [Cách tạo hàng ngàn Proxy IPv6 miễn phí](https://www.youtube.com/watch?v=tINp0ojhr5E).
- [Tổng quan Private Server](https://www.youtube.com/watch?v=WaEWPXJbnlY).
- [Đăng ký dùng thử](https://www.youtube.com/watch?v=ok17YJjv2wE&list=PLc1eKtVmj6Cw&index=1).
- [Playlist hướng dẫn Global](https://www.youtube.com/playlist?list=PLpEwQxqRGbYlXaITaChGEZHLQvuZpNVAs).
- [Playlist GPM Automate](https://www.youtube.com/playlist?list=PLpEwQxqRGbYnjNLxntBctWq4k4ksGv19F), [ví dụ](https://www.youtube.com/playlist?list=PLpEwQxqRGbYmP8j5ErJprvIHBsEluj1ZE).
- [Facebook GPM Login Việt Nam](https://www.facebook.com/gpmantidetectbrowservn/) được Help dẫn cho hỗtrợ/PrivateServer. Không dùng sốlike hoặcmetadata để suy ra cách vận hành.

Parent đã báo YouTube www bị CONNECT403. Linkvideo tìm được không đồng nghĩa đã xem nội dung. Không dùng tài khoản/cookie người khác để vượt hạn chế.

## 9. Bộ tình huống nghiệm thu để đo “giống”

Không gán tỷ lệ100% từ một checklistUI. Mỗi ca phải có input, output, ảnhchụp, trạng tháidisk và network/runtime tương ứng, cùng phiên bảnhost/browser.

| Ca | Thao tác và quan sát cần ghi |
| --- | --- |
| A01 | Tạo profile default; so sánh từng ô/tóm tắt fingerprint, seed ổn định sau restart. |
| A02 | Đổi browser+OS; UA/font/GPU/screen nhất quán, không chỉ thaylabel. |
| A03 | Paste mỗi rawproxyformat, authđúng/sai/timeout, UDPflag, chọnlibrary; không rơi về direct ngoài ýmuốn. |
| A04 | Timezone/language/geolocation theo proxy và thủcông; kiểm traIPprovider thực sự qua proxy. |
| A05 | Cookie import trước startup; localstorage/history/cache/extension giữ sauclose/reopen. |
| A06 | Clone profile có login+extension; dữ liệugiữ, ID/identity/fingerprintkhác; sửa clone không tác độngsource. |
| A07 | Delete cache xong cookie/login vẫn còn; fullclear là hành độngkhác. |
| A08 | Softdelete rồirestore; toànbộ profileidentity vàdata giữnguyên; harddelete dọndisk sauconfirm. |
| A09 | Bulkcreate quantity+proxyline mapping vàExcelmẫu; lỗi từngdòng, rollback/partialpolicy rõràng. |
| A10 | Groupđangchứa profile khôngxóa âmthầm; move rồidelete; sortorder chuẩn. |
| A11 | Proxy tag/filter/checklive/ping; copyraw khôngròcredentialvào log. |
| A12 | Chromium extensionURL/CRX/ZIP/folder vàscopegroup; Firefoxaddons riêng. |
| A13 | Bảng sort/filter/checkbox/quétchuột/cộtTagLastRunNote, menucontext, pin,color,copyID. |
| A14 | Multi-tab startup vs nhiềuwindow; restorelastsession; bookmarkName|URL. |
| A15 | Syncaction keyboard/mouse/scroll/input/iframes/differentDPI vàarrangewindows; ghi phạmvi exact. |
| A16 | API20routes, enumint/string, nullpatch, commonenvelope,pagination vàstartcache/CDP thật. |
| A17 | HTTPportbận: fallback vàhttp.port; loopbackbinding/authpolicy khôngbị nhầm với customAPI. |
| A18 | Localbackup/restore sang máyWindows/macIntel khác: cookieencryption/path/font/enginecompatibility. |
| A19 | PrivateServer share/revoke/owner/active-lock,2user đồngthời, mấtmạng, conflict; cầnbackendhợppháp. |
| A20 | Automate workflowthật cóloop/condition/extraction/concurrency/log/error; không chỉ JSON5steps. |
| A21 | Fingerprint behaviors canvas/audio/WebGL/fonts/clientrect/WebRTC/media/CPU/RAM/device: API consistency + stability, không lấy tênsetting làm chứngminh. |

Các ca chưa có runtime/engine/backend phải để “chưa xác minh”, không tạo pass giả hoặc chấm phầntrăm tùyý.
