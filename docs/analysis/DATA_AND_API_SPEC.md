# Đặc tả dữ liệu/API từ bộ cài — phân tích vòng 2

Bản ghi này ưu tiên bằng chứng trong đúng artifact đã gửi. Không chạy GPM, không gọi máy chủ hoặc dùng credential của nhà phát hành. Không phải kết luận đã khôi phục toàn bộ mã nguồn hoặc chứng minh tương đương 100%.

## 1. Nguồn và cách giải mã literal

- Ứng dụng chính: `GPMLoginGlobal.exe`, SHA-256 `4395e4ed3a3548465c0f339f4e522ead0e9faa9adabb0dadcb73f63bd7a8688e`.
- Mọi vị trí bên dưới là **file offset**, không phải địa chỉ thực thi. `property-bindings.json` có 384 literal Getter/Setter được chọn theo các loại DTO/ViewModel liên quan.
- Các literal UTF-16 trong một số vùng NativeAOT có độ dài ký tự 32-bit ở ngay trước nội dung; mẫu quan sát dùng `2*n-1` byte với high-byte zero cuối bị lược. GNU `strings -el` vì thế bỏ mất ký tự cuối (ví dụ `handshak` thay vì `handshake`). Vòng này chỉ nhận bản ghi khi độ dài trước khớp chính xác và phục hồi một high-byte zero; giữ byte range gốc. Đây là quy tắc quan sát trong mẫu ASCII đang xét, không tuyên bố bộ đọc NativeAOT tổng quát.
- Kết quả shell/Python này không phải REA Evidence mới; bản ghi REA managed trước đó vẫn chỉ xác nhận không có CIL ở app chính. Các lệnh/route được liệt kê là literal tĩnh; phương thức HTTP/caller/backend chưa xác minh nếu không có nguồn bổ sung.

## 2. Lược đồ SQLite thực tế đã khôi phục

Đã đọc **nguyên script `CREATE TABLE IF NOT EXISTS`** tại `0x4e65af3` và các SQL tham số riêng lẻ. Khác với lần đầu chỉ suy luận từ tên, đây là cấu trúc có thể kiểm tra bằng parser SQLite. Tệp đầy đủ nội bộ: `round2/schema/observed-sqlite-schema.sql`; bản ghi offset: `sql-literals.json`.

| Bảng | Cột quan sát trực tiếp | Ràng buộc đáng chú ý |
| --- | --- | --- |
| `groups` | `id` TEXT, `name` TEXT, `order` INTEGER, `created_at` TEXT, `updated_at` TEXT, `created_by` TEXT, `updated_by` TEXT | id PK; name NOT NULL; order mặc định 0; created_by/updated_by mặc định chuỗi rỗng |
| `profiles` | `id` TEXT, `name` TEXT, `group_id` TEXT, `storage_path` TEXT, `fingerprint_data` TEXT, `dynamic_data` TEXT, `last_run_by` TEXT, `last_run_at` TEXT, `is_deleted` INTEGER, `deleted_at` TEXT, `created_at` TEXT, `updated_at` TEXT, `created_by` TEXT, `updated_by` TEXT | group_id FK → groups, ON DELETE SET NULL; fingerprint_data/dynamic_data/storage_path NOT NULL; is_deleted mặc định 0 |
| `proxies` | `id` TEXT, `raw_proxy` TEXT, `meta_data` TEXT, `created_at` TEXT, `updated_at` TEXT, `created_by` INTEGER, `updated_by` INTEGER | raw_proxy mặc định chuỗi rỗng; metadata tách riêng; created_by/updated_by INTEGER mặc định 0 |
| `tags` | `id` TEXT, `name` TEXT, `color` TEXT, `category` TEXT | category mặc định 'proxy'; id PK |
| `profile_tags` | `id` INTEGER, `profile_id` TEXT, `tag_id` TEXT, `created_at` TEXT, `updated_at` TEXT | FK profile/tag ON DELETE CASCADE; id AUTOINCREMENT |
| `proxy_tags` | `id` INTEGER, `proxy_id` TEXT, `tag_id` TEXT, `created_at` TEXT, `updated_at` TEXT | FK proxy/tag ON DELETE CASCADE; id AUTOINCREMENT |

Có 6 index tường minh: `idx_profiles_group_id`, `idx_profiles_is_deleted`, `idx_profile_tags_pid`, `idx_profile_tags_tid`, `idx_proxy_tags_pid`, `idx_proxy_tags_tid`. Literal `profile_data.db` có tại `0x4f78b7c`; đường dẫn thực tế và phiên bản migration đang chạy vẫn chưa xác minh.

Kiểm tra độc lập: thực thi **chỉ DDL trong SQLite in-memory mới**, không phải chạy GPM: 6 bảng/6 index tạo thành công; với `PRAGMA foreign_keys=ON`, xóa group đặt `profiles.group_id=NULL`, xóa profile xóa liên kết `profile_tags`. Không suy ra GPM thật có bật PRAGMA đó chỉ từ thử nghiệm này.

Các quy tắc được SQL hỗ trợ:
- Tên nhóm được so sánh không phân biệt hoa/thường bằng `LOWER(name)` (`0x4ed5d6f`, `0x4ed5e0c`).
- Xóa mềm đặt `is_deleted=1`, `deleted_at=@Now`, `updated_at=@Now` (`0x4f08d1d`); có SQL DELETE riêng để xóa thật (`0x4e7eed7`).
- Hồ sơ tách `fingerprint_data` và `dynamic_data`, không phải một object cấu hình phẳng. Nội dung JSON/nén/serializer bên trong chưa được chứng minh chỉ bởi tên cột.
- Một số truy vấn danh sách trả `'' AS FingerprintData`; truy vấn từng hồ sơ mới lấy đầy đủ (`0x4ed78c9` so với `0x4ed7d55` và các sort variants). Không nên tải fingerprint nặng cho toàn bộ bảng.
- Filter hồ sơ SQL hỗ trợ soft-delete, nhiều search terms bằng `json_each`, ID, group và tag; dấu wildcard được escape. Cần giữ cùng toán tử tìm kiếm trước khi khẳng định giống kết quả UI.
- Nhãn được phân `category`; proxy và hồ sơ có bảng liên kết nhãn riêng. Bản thay thế hiện mới có nhãn hồ sơ nên còn thiếu một phần mô hình.

## 3. 42 trường DTO hồ sơ thấy trực tiếp

Tên dưới đây được phản chiếu trong binding Getter/Setter của `GPMLoginGlobal.Lib.Application.Dtos.ProfileDto`. Kiểu C#, enum numeric, mặc định được chọn và cơ chế side effect **chưa được phục hồi**. Nhóm ý nghĩa là diễn giải từ tên, không phải layout UI đã chạy.

### Nhận diện/cấu hình cơ bản

| Trường nguyên gốc | Getter offset | Đối chiếu Profile Studio 0.1 |
| --- | --- | --- |
| `Name` | `0x1b1a040` | `name` |
| `GroupId` | `0x1b1a27a` | `groupId` |
| `BrowserType` | `0x1b1aa0c` | Chưa có tương đương được chứng minh |
| `BrowserVersion` | `0x1b1caff` | Chưa có tương đương được chứng minh |
| `OsType` | `0x1b1cc2a` | Chưa có tương đương được chứng minh |
| `TaskBarTitle` | `0x1b1abc1` | Chưa có tương đương được chứng minh |
| `StartupUrls` | `0x1b1ac6d` | `startUrls` |
| `InitCookie` | `0x1b1d351` | Import/export cookie JSON riêng; chưa map trường gốc |

### User agent/ngôn ngữ/thời gian

| Trường nguyên gốc | Getter offset | Đối chiếu Profile Studio 0.1 |
| --- | --- | --- |
| `AllowEditUserAgent` | `0x1b1ceb8` | Chưa có tương đương được chứng minh |
| `CustomUserAgent` | `0x1b1cf70` | `userAgent` |
| `FixedLanguage` | `0x1b1d1fb` | `language` |
| `IsLanguageBaseOnIp` | `0x1b1d0c6` | Chưa có tương đương được chứng minh |
| `TimeZone` | `0x1b1b238` | `timezone` |
| `TimeZoneBaseOnIp` | `0x1b1b031` | Chưa có tương đương được chứng minh |

### Kết nối/WebRTC/địa lý

| Trường nguyên gốc | Getter offset | Đối chiếu Profile Studio 0.1 |
| --- | --- | --- |
| `BypassProxyExtensions` | `0x1b1ae11` | Chưa có tương đương được chứng minh |
| `CustomDnsServer` | `0x1b1b73e` | Chưa có tương đương được chứng minh |
| `PortProtect` | `0x1b1b694` | Chưa có tương đương được chứng minh |
| `WebRtcMode` | `0x1b1aecf` | Chưa có tương đương được chứng minh |
| `FixedWebrtcPublicIp` | `0x1b1af77` | Chưa có tương đương được chứng minh |
| `GeolocationMode` | `0x1b1b3b2` | Chưa có tương đương được chứng minh |
| `GeolocationBaseOnIp` | `0x1b1b464` | Chưa có tương đương được chứng minh |
| `GeolocationLatitude` | `0x1b1b51e` | Chưa có tương đương được chứng minh |
| `GeolocationLongitude` | `0x1b1b5d8` | Chưa có tương đương được chứng minh |

### Bề mặt hiển thị/fingerprint

| Trường nguyên gốc | Getter offset | Đối chiếu Profile Studio 0.1 |
| --- | --- | --- |
| `ScreenInfo` | `0x1b1baa2` | `width/height` cửa sổ; chưa tương đương screen/avail/touch của GPM |
| `CanvasMode` | `0x1b1bb4a` | Chưa có tương đương được chứng minh |
| `ClientRectMode` | `0x1b1bbf2` | Chưa có tương đương được chứng minh |
| `FontMode` | `0x1b1d022` | Chưa có tương đương được chứng minh |
| `WebglImageMode` | `0x1b1bca2` | Chưa có tương đương được chứng minh |
| `WebglMetaDataMode` | `0x1b1bdf8` | Chưa có tương đương được chứng minh |
| `WebGlVendor` | `0x1b1bfae` | Chưa có tương đương được chứng minh |
| `WebGlRenderer` | `0x1b1c15e` | Chưa có tương đương được chứng minh |
| `AudioMode` | `0x1b1bd52` | Chưa có tương đương được chứng minh |

### Phần cứng/thiết bị

| Trường nguyên gốc | Getter offset | Đối chiếu Profile Studio 0.1 |
| --- | --- | --- |
| `HardwareConcurrency` | `0x1b1c537` | Chưa có tương đương được chứng minh |
| `DeviceMemory` | `0x1b1c673` | Chưa có tương đương được chứng minh |
| `DeviceName` | `0x1b1d2a9` | Chưa có tương đương được chứng minh |
| `MacAddress` | `0x1b1c887` | Chưa có tương đương được chứng minh |
| `IsHideMediaDevices` | `0x1b1c7cf` | Chưa có tương đương được chứng minh |
| `IsMaskedMedia` | `0x1b1c20c` | Chưa có tương đương được chứng minh |
| `AudioInputs` | `0x1b1c2ba` | Chưa có tương đương được chứng minh |
| `AudioOutputs` | `0x1b1c364` | Chưa có tương đương được chứng minh |
| `VideoInputs` | `0x1b1c410` | Chưa có tương đương được chứng minh |
| `IsUseBluetooth` | `0x1b1c71f` | Chưa có tương đương được chứng minh |

Không nên tạo các trường này rồi chỉ gán nhãn “đã hỗ trợ”. Ví dụ có `CanvasMode` hoặc WebGL preset trong form không chứng minh engine áp dụng noise giống GPM. `ScreenInfo` cần cả avail size/touch/mobile metadata, không thể đánh đồng với kích thước cửa sổ.

## 4. Proxy và cài đặt ứng dụng

`EnterProxyViewModel` có các trường `Type`, `Host`, `Port`, `Username`, `Password`, `IsStandardProxy`, `IsSocks5`, `IsUseUdpSocks5`, `IsRouteProxy`, `RoutePrefix`, `RouteApiKey`, `RouteChangeProxyOnStartup`, bộ chọn config và lệnh kiểm tra. Đây là xác nhận **trường giao diện tồn tại**, không phải chứng minh định dạng secret hoặc đường đi UDP.

Đọc được resource manifest xoay proxy thực tế (18 nhà cung cấp), gồm schema `prefix`, `vendor`, `get_new_proxy_api_request`, `get_current_proxy_api_request`, `response_json_nodes`, `min_time_to_route`. Request có `route_url_template`, `method`, `post_data`; template dùng placeholder, không phải credential thực. Schema node phản hồi ánh xạ host/port/user/password. Bộ manifest mẫu có thêm nội dung sau JSON đầu nên không được đọc máy móc là một file JSON duy nhất. Không gửi request đến các URL này trong phân tích.

Proxy checker có 4 cấu hình, ánh xạ country/city/timezone/latitude/longitude/public IP/language. Bản hiện chỉ kiểm tra IP qua một endpoint nên chưa tương đương quy trình tự đồng bộ timezone/ngôn ngữ/geo theo IP.

`SettingPageViewModel` gồm 40 trường/lệnh được chọn, trong đó có `RestoreLastSession`, `AutoClearCache`, `UseGpu`, `AutoChangeBrowserScreenResolution`, `LaunchParameters`, `Bookmarks`, `LocalStoragePath`, `AutomationLocation`, các default noise modes, `McpEnabled/McpUrl/McpToken`, `AllowRemoteFromInternet`, `PrivateServerUrl`. Tên trường token là bằng chứng schema, không ghi hoặc dùng giá trị token.

## 5. Dữ liệu preset đọc được bằng parser JSON

Đây là file resource thực đã trích qua Avalonia index, không phải đoán từ tên. `resource-schema-catalogue.json` giữ offset, size và SHA-256 từng resource; không đưa toàn bộ dataset/font vào source app.

| Resource | Nội dung cấu trúc quan sát |
| --- | --- |
| `browser_list_data.json` | 5 family: Chromium 8 phiên bản, Firefox 4, Edge 5, Opera 4, Brave 5. Mỗi version có form UA cho Windows/macOS Intel/macOS M/Linux/Android; các shell Chromium có `chromium_core_version`. |
| `Fingerprint/os.json` | 5 khóa: windows, linux, macos_intel, macos_m, android; form tham số UA phân Chromium/Firefox. |
| `Fingerprint/screen_sizes.json` | 40 preset; name, width/height, avail_width/avail_height, category, mobile_model, max_touch_points; preset Real dùng -1. |
| `Fingerprint/languages.json`, `timezones.json` | 184 mục ngôn ngữ, 596 mục timezone; BOM UTF-8 phải được xử lý. |
| `Fingerprint/mobile_meta_data.json` | 14 mẫu; mobile_model, device_memory, hardware_concurrency, js_heap_size_limit, platform_version. |
| WebGL metadata | Windows 320, macOS Intel 32, macOS M 3, Linux 26, Android 14 mẫu; vendor/renderer, Firefox renderer variants, extensions và giới hạn WebGL. Đây chưa phải phương thức áp dụng trong browser engine. |
| fonts/font-files | Mapping OS fonts có 4 nhóm; danh mục font-files 372 mục, fontName/osExport/filePath. |
| hardware_noise_config.json | Hai nhánh chromium/firefox; audio, client_rect, canvas, webgl; từng thành phần có min/max/step hoặc noise token. Range cấu hình không chứng minh thuật toán PRNG, seed hay persistence của engine. |

## 6. Route API: phải tách backend với API điều khiển cục bộ

Bản ghi `api-cli-literals.json` có các route literal chính xác như `/api/profiles/create`, `/api/profiles/bulk-edit-property`, `/api/profiles/start-using/{0}`, `/api/groups/share/{0}`, `/api/proxies/bulk-create`, `/api/tags/get-by-name?name=`, `/api/file/create-upload-url`, `/api/users/current-user`. Không tự động gán tất cả chúng cho localhost: presence của share/user/file/license cho thấy có thể là private/cloud server client; cần caller/xref hoặc tài liệu công khai để kết luận.

Đặc biệt `/api/profiles/start-using/{0}` **không được coi là mở browser** chỉ từ tên. Nó có thể là khóa/chỉ báo đang dùng trong backend. Literal local host `http://127.0.0.1:` và `http://localhost:` có ở vùng khác nhưng chưa chứng minh route nào bind tại đó.

Có handshake/license/update template v1/v2. Phân tích không thử hoặc tái tạo cơ chế vượt license, không dùng credential nhặt trong binary. Endpoint/local API v3 do tài liệu chính thức mô tả phải được parent đối chiếu riêng với version này. Bản Profile Studio `/v1/...` hiện tại là giao thức riêng, chưa tương thích GPM.

## 7. Lệnh browser và ranh giới engine

Các literal đã phục hồi đúng ký tự cuối bao gồm `--remote-debugging-port=`, `--user-data-dir="`, `--proxy-server="`, `--user-agent="`, `--lang=`, `--window-size=`, `--window-position=`, `--restore-last-session`, `--load-extension="`, `--dns-server=`, `--video-record` và nhiều flag tắt background throttling. Chúng là các mảnh template, chưa khôi phục hoàn chỉnh quoting/order hay argv cuối.

Có flag riêng GPM `--gpm-sync-always-active`, `--gpm-disable-machine-id`, và JS flag `--gpm_nan_value=127`. Điều này bổ sung bằng chứng về phụ thuộc browser tùy biến. Không thể chỉ chuyển cấu hình form sang Electron thông thường rồi tuyên bố engine tương đương.

## 8. Thứ tự tái tạo để gần nhất

1. **Hợp đồng dữ liệu trước:** thêm adapter đọc/ghi versioned, giữ nhóm fingerprint/dynamic riêng, tag categories và tham chiếu, quy tắc soft-delete/audit và dữ liệu chưa hiểu để tránh làm mất khi roundtrip. Chưa đọc database người dùng thật trong bước này.
2. **Bộ chọn đủ schema:** browser family + core version + OS preset, proxy standard/route/UDP, IP-derived timezone/language/geolocation, các mode fingerprint. Chỉ bật option khi engine adapter thật sự hỗ trợ; còn lại đánh dấu chưa hỗ trợ.
3. **Tách engine adapter:** Chromium/Electron, Firefox, browser tùy biến phải có capability matrix riêng. Không ép mọi loại vào cùng một BrowserWindow.
4. **API compatibility theo tài liệu + contract test:** route, HTTP verb, tên snake_case, shape lỗi và trường debug-port/browser-path phải đối chiếu request/response thực; không dùng route cloud làm API localhost.
5. **Nghiệm thu parity bằng fixture:** cùng cấu hình mẫu ở GPM/bản mới → so sánh config roundtrip, UI lựa chọn, argv đã redact, browser-observable values, cookie/cache/proxy behavior, soft-delete/recovery. SQL/preset giống chưa đủ chứng minh kết quả browser giống.

### Những điều vòng này vẫn chưa xác minh

Enum numeric/default selection; serializer và nội dung fingerprint_data/dynamic_data; randomization seed/noise algorithm; exact local API method/binding; cloud protocol/auth; proxy UDP routing engine; browser patch implementation; live Win/macOS UI behavior. Cần native xref/decompilation hoặc quan sát runtime có kiểm soát cho từng phần, không suy luận 100% từ metadata.

## 9. Đối chiếu với tài liệu API công khai hiện hành

Nguồn độc lập bổ sung bởi nhánh nghiên cứu tài liệu: [api-docs.gpmloginapp.com](https://api-docs.gpmloginapp.com/), SHA-256 HTML `2c1bc5e33fc6e9a9d2c9e52107fecbacee1ad9459467161394f39adea31c2b84`. Chỉ đọc trang tài liệu công khai, không gọi API cục bộ hoặc backend thật. `round2/docs/api-route-index.json` có 20 route và 26 trường ProfileApiDto theo tài liệu; `round2/schema/docs-native-correlation.json` giữ so khớp tên literal với binary.

- Base được tài liệu nêu là `http://localhost:9495/api/v1`, khác API độc lập hiện tại của Profile Studio. Route API bản cũ v3 từ tài liệu khác không được trộn tùy tiện.
- Tài liệu mô tả POST `/profiles/create`, POST `/profiles/update/{id}`, GET `/profiles/start/{id}`, GET `/profiles/stop/{id}`; `/profiles/delete/{id}?mode=soft|hard`. Đặc biệt các thao tác trạng thái dùng GET theo hợp đồng GPM; adapter tương thích cần xử lý chính xác thay vì đổi tất cả thành POST.
- Tạo profile chỉ bắt buộc name; field bỏ qua/null dùng mặc định và random fingerprint. Update bỏ qua/null **giữ giá trị cũ**, không reset. Phải viết contract test cho khác biệt này.
- Start có `remote_debugging_port`, `window_scale`, `window_pos`, `window_size`, `skip_proxy_check`, `addition_args`; trả thông tin điều khiển remote debugging/websocket theo mô tả. Có literal tương ứng trong binary nhưng chưa xác minh response của đúng build bằng chạy app.
- Enum được tài liệu nêu (không phải đã đọc native numeric): browser type 1 Chrome/2 Firefox/3 Edge/4 Opera/5 Brave; OS 1 Windows/2 macOS Intel/3 macOS ARM/4 Linux/5 Android. Canvas 1 Noise/2 Real/3 Block; WebRTC 1 Based-on-IP/2 Fixed/3 Real/4 Disabled; geolocation 1 Allow/2 Prompt/3 Block; client rect, audio, WebGL image dùng 1 Noise/2 Real; WebGL metadata dùng 1 Masked/2 Real. Cần xác nhận đúng version trước khi gán numeric vào data người dùng.

| Tên trường theo tài liệu | Kiểu tài liệu | Literal cùng tên trong binary |
| --- | --- | --- |
| `name` | `string` | `0x4f6c1f8` |
| `group_id` | `string` | `0x4f51a7a` |
| `raw_proxy` | `string` | `0x4f79d28` |
| `bypass_proxy_extensions` | `string` | `0x4f39723` |
| `browser_type` | `enum` | `0x4f39337` |
| `browser_version` | `string` | `0x4f39356` |
| `os_type` | `enum` | `0x4f7340f` |
| `custom_user_agent` | `string` | `0x4f41779` |
| `task_bar_title` | `string` | `0x4f82197` |
| `webrtc_mode` | `enum` | `0x4f90e4d` |
| `fixed_webrtc_public_ip` | `string` | `0x4f4cbc5` |
| `port_protect` | `string` | `0x4f78218` |
| `geolocation_mode` | `enum` | `0x4f4e4d5` |
| `canvas_mode` | `enum` | `0x4f3c1f0` |
| `client_rect_mode` | `enum` | `0x4f3e325` |
| `webgl_image_mode` | `enum` | `0x4f90c9c` |
| `webgl_metadata_mode` | `enum` | `0x4f90dc8` |
| `audio_mode` | `enum` | `0x4f28fe6` |
| `is_masked_media` | `bool` | `0x4f64958` |
| `font_mode` | `enum` | `0x4f4d821` |
| `timezone_base_on_ip` | `bool` | `0x4f8415f` |
| `timezone` | `string` | `0x4f84148` |
| `is_language_base_on_ip` | `bool` | `0x4f648da` |
| `fixed_language` | `string` | `0x4f4cba2` |
| `startup_urls` | `string` | `0x4f809f4` |
| `note` | `string` | `0x4f70d88` |

Sự xuất hiện cùng tên làm tăng độ tin cậy về vùng dữ liệu nhưng không chứng minh enum/default/kiểu JSON của binary giống docs hiện tại. Route private/cloud không có prefix `/api/v1` ở mục 6 vẫn phải tách khỏi nhóm localhost theo tài liệu này. Cần kết hợp video/tài liệu thao tác và runtime fixture của đúng bản trước khi cam kết 100%.

## 10. Export/import/backup và bố trí thư mục hồ sơ

Vòng bổ sung dùng `round2/ui/frozen-strings.json` đã được nhánh UI phục hồi từ vùng native frozen, thay vì các bản GNU strings mất ký tự cuối. `round2/schema/export-import-evidence.json` ghi 52 literal được chọn với object VA, hydrated offset và pointer-source provenance. **Object VA/hydrated offset không phải file offset của literal gốc**; không tráo đổi với các offset ở phần 1–9.

### Những điều có chứng cứ trực tiếp

- Hướng dẫn tiếng Việt nguyên gốc tại object VA `0x145fee198`: **Full Restore** yêu cầu giải nén file sao lưu ZIP, vào Cài Đặt → LocalStorage → Thay đổi, chọn thư mục vừa giải nén, lưu và khởi động lại. Bản tiếng Anh cùng nghĩa tại `0x145fee300`.
- **Selective Restore** (`0x1460563b0`, `0x146056470`) chỉ tới Profile → Import, chọn file backup ZIP. Vì vậy backup đầy đủ và import chọn lọc là hai luồng sử dụng thực được mô tả trong artifact; không phải một nút “import cấu hình JSON” duy nhất.
- Có literal `GPMLoginGlobal_Backup`, prefix `exported_profiles_`, `.zip`, `*.zip`, `_merged.zip`. Chúng chứng minh các tên/định dạng được code biết đến, **chưa chứng minh tất cả là tên mặc định export hoặc đường dẫn thành viên ZIP**.
- Lời cảnh báo backup ghi tính năng không hỗ trợ Cloud Profiles, phải backup trên máy chủ giữ dữ liệu (`0x1460846e8`). Không áp luồng sao lưu LocalStorage nguyên trạng cho cloud.
- Import có cảnh báo rằng máy nhận phải cài các extension tương ứng nếu hồ sơ mang dữ liệu extension (`0x145ffe328`, bản Việt `0x14608b308`). Có `extension_dependencies.json` và `extension_data.dat` trong tập literal; định dạng/nơi chứa chưa được đọc bằng parser từ package thực.
- Có `gpm_config.json` (`0x1460f5540`), `gpm_fg.dat` (`0x1460f55c8`), `gpm_pi.dat` (`0x1460f55f8`), `profile_data.db` (`0x14612e8c8`), `database.db`, `setting.dat` và `AppState.dat`. Đây là **các tên tệp ứng viên**, chưa xác minh tệp nào nằm ở thư mục gốc, từng profile hay archive nào. Tuyệt đối không tự tạo cây ZIP từ danh sách tên rồi gọi là chuẩn GPM.
- `storage_path` tồn tại trong SQLite thật; có plugin đổi toàn bộ tên thư mục theo tên profile và yêu cầu đóng cả tiến trình nền. Do đó không được giả định mọi profile luôn nằm trong thư mục UUID hoặc tên không bao giờ đổi. Bật tự nhập hồ sơ có sẵn được gợi ý bởi `AutoImportProfileIfNotExistInDb`/“Automatically import existing profiles if available”, nhưng quy tắc phát hiện file chưa xác minh.
- App có cảnh báo không trỏ archive/local storage của bản này vào thư mục GPMLogin V4 vì có thể làm hỏng dữ liệu bản trước (`0x14600c698`). Adapter migration không được thử ghi trực tiếp vào dữ liệu V4 khi chưa biết schema/version.
- Cookie có lời nhắc “Cookie with json format...”, các tên `ExportCookies.json`, `TempCookie.json`, `TempCookies.json`, `IncludeCookies`/`include_cookies`; có private callbacks `/private/write-cookie-file` và `/private/restore-cookie-done-event`. Điều này xác nhận một luồng cookie JSON/callback tồn tại, **chưa chứng minh root là array hay object, field SameSite/expires nào, hoặc callbacks có thể gọi từ bên ngoài**.
- Lỗi “FingerprintData không phải JSON hợp lệ”/“không deserialize được” củng cố việc dữ liệu phải đạt một ranh giới parse JSON trong ứng dụng. Chưa biết có lớp nén/mã hóa trước bước đó hoặc schema JSON hoàn chỉnh; không đồng nhất ngay `gpm_fg.dat` với JSON plaintext.

### Cấu trúc package vẫn chưa được chứng minh

Chưa có một file export/backup do đúng phiên bản tạo ra để đọc directory inventory. Chưa xác nhận manifest cấp package, magic/version header, compression/encryption, map ID/nhóm/nhãn, bundle fingerprint-only so với full browser data, hoặc chính sách ghi đè/nhân bản khi import. Literal `manifest.json` còn xuất hiện trong extension workflow và không phải bằng chứng độc lập cho manifest export profile.

Các tên Chromium/Firefox quen thuộc (`Default`, `Network`, `Cookies`, `Local State`, `IndexedDB`, `places.sqlite`, `prefs.js`) có trong artifact; không đủ để kết luận `Default/Network/Cookies` là đường dẫn GPM thực tế hoặc mọi dữ liệu đều được mang vào export. SQL ghi bookmark Firefox và mẫu `firefox_places.sqlite` chứng minh có code biết cấu trúc bookmarks, không chứng minh clone/export chuyển trọn session Firefox.

### Cookie và tính di chuyển Windows ↔ macOS Intel

Trình duyệt Chromium tiêu chuẩn có thể mã hóa cookie/credential bằng cơ chế gắn OS/tài khoản (Windows DPAPI/App-Bound Encryption tùy phiên bản; macOS OSCrypt/Keychain). Vì vậy **copy database Cookies hoặc cả thư mục không bảo đảm giữ phiên đăng nhập khi đổi máy hay đổi hệ điều hành**. GPM dùng browser tùy biến và có export/import cookie riêng; không được áp mặc định Chrome hoặc suy ra GPM xử lý key giống Chrome. Không trích xuất key/secret hoặc vượt cơ chế khóa trong phân tích này.

Nghiệm thu đúng phải dùng profile thử và cookie giả do người kiểm thử kiểm soát: đóng browser hoàn toàn, export theo đúng mode, kiểm tra package, import sang profile mới trên cùng OS và qua Windows/macOS, rồi so sánh domain/path/secure/httpOnly/SameSite/expiration và trạng thái site thử. Các session còn phụ thuộc local storage/IndexedDB, service worker và ràng buộc phía website; “đã chuyển cookie” không đồng nghĩa “giữ đăng nhập mọi website”. Bản thay thế cần thông báo rõ giới hạn portability và giữ mode cấu hình/fingerprint-only tách khỏi mode bao gồm dữ liệu trình duyệt.

Để chốt cấu trúc mà không đụng dữ liệu người dùng: cần 1–2 package export thử từ đúng build (fingerprint-only và full-data nếu có), chứa một profile giả, cookie/site thử và extension thử. Sau đó mới cố định cây archive, schema manifest, quy tắc đổi ID và contract roundtrip.

## 11. Mẫu Excel thực tế trong bộ cài

Đã trích `Assets/Samples/sample_excel_import.xlsx` bằng kiểm tra checksum của Inno, SHA-256 `667ccdebddd522aab0303f492f90e7699e994497a3be9d6b9f56be108235e2ec`. Chỉ đọc header, không công bố dữ liệu các dòng mẫu.

Worksheet1 có5cột theo thứ tự:

| Cột | Header nguyên bản |
| --- | --- |
| A | Browser type |
| B | Profile name |
| C | Proxy type |
| D | Proxy |
| E | Group name (optinal) |

Lỗi chính tả `optinal` được giữ để nhận diện đúng mẫu, không tự sửa rồi tuyên bố parser tương thích. Bản0.1 đang dùng12cột JSON/CSV/XLSX riêng nên chưa nhập đúng templateGPM. Header chứng minh template; quy tắc type aliases, dòng lỗi, missinggroup, versiondefaults và importtransaction còn cần actual-importfixture để chốt. Bằng chứng riêng: `round2/schema/excel-template-headers.json`, `extract_excel_headers.py`.
