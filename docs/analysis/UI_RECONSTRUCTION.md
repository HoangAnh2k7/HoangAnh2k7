# Tái dựng giao diện từ bộ cài: chứng cứ vòng 2

Mục tiêu là làm bản thay thế giống cách sử dụng GPMLoginGlobal nhất có thể. Kết quả dưới đây là **phân tích tĩnh**, chưa chạy ứng dụng GPM và chưa chứng minh giao diện giống từng pixel. Không dùng tên ViewModel như bằng chứng cho kích thước, vị trí hoặc hành vi đã chạy.

## Cập nhật: khóa locale đã được kiểm tra bằng mã máy

Sau bước tài nguyên/chuỗi ban đầu, đã kiểm tra độc lập ba hàm khởi tạo locale: EN `0x140a2e608..0x140a348d5`, VI `0x140a34928..0x140a3abf5`, ZH `0x140a3ac48..0x140a40f15`. Mỗi hàm có **547 khóa khác nhau**, tổng 1641 cặp literal key/value. Cả ba có cùng tập khóa; EN/VI cùng thứ tự, ZH đảo vị trí `Running` và `ReleaseStatus`. Vì vậy không được ghép dịch bằng vị trí của ba bảng.

Kiểm tra Capstone đọc **byte gốc PE**, ranh giới hàm từ `.pdata`, xác nhận từng lệnh gọi `0x1416b18a0` có chuỗi lệnh liền trước: `LEA RDX,[RIP+key]`, `LEA R8,[RIP+value]`, `MOV R9D,2`. Toàn bộ 547/547 lệnh trong từng hàm khớp mẫu, địa chỉ key/value tra về typed frozen-string map. EN/VI khớp toàn bộ cặp và địa chỉ đã lấy từ pseudocode Ghidra. Đây là bằng chứng độc lập với cách Ghidra đặt overlay, không dựa vào các chuỗi đứng cạnh nhau.

Ví dụ ngắn: khóa `Save` nhận `Save` / `Lưu` / `保存`. Toàn bộ locale được giữ riêng trong workspace; báo cáo công khai chỉ ghi phương pháp, số lượng và ví dụ ngắn. Vai trò dictionary/localization được suy ra từ bối cảnh constructor/resource path và tính nhất quán khóa; phần mềm chưa được chạy để quan sát màn hình.

Lần Ghidra đầu tiên nạp ảnh dẫn xuất lệch `0x4400` so với base thực `0x145f22030`; root đã đánh dấu superseded và chạy lại tại base lấy từ manifest. Kiểm tra lệnh/địa chỉ gốc nói trên chứng minh các cặp EN/VI không đổi, nhưng không sử dụng lần overlay sai cho kết luận về dữ liệu bộ nhớ khác.

## 1. Những gì thực sự khôi phục được

| Chứng cứ | Kết quả | Giới hạn |
| --- | --- | --- |
| PE ứng dụng chính | 100447536 byte; SHA-256 `4395e4ed3a3548465c0f339f4e522ead0e9faa9adabb0dadcb73f63bd7a8688e` | Đúng tệp đã trích từ bộ cài; không phải mã nguồn gốc. |
| Chỉ mục tài nguyên Avalonia nhị phân v2 | 12 chỉ mục, 384 entry tổng; chỉ mục ứng dụng tại file `0x1d3f78d`, có 371 entry | Một số chỉ mục thuộc thư viện nền. Offset/size/hash được kiểm tra trong phạm vi tệp. |
| `/!AvaloniaResourceXamlInfo` của ứng dụng | 62 ánh xạ class → đường dẫn XAML, bao gồm App, locale, trang, popup và plugin | Đây không phải 62 màn hình. Chỉ mục chứng minh tên/đường dẫn thật; các layout XAML ứng dụng đã biên dịch, không còn payload XML tương ứng trong bảng assets. |
| Binding literal trong binary | 57 class UI/ViewModel và 511 tên property/command, mỗi accessor có vị trí byte | Chứng minh surface binding, không chứng minh sự hiện diện đồng thời, thứ tự trên màn hình hoặc kết quả lệnh. |
| NativeAOT RTR | Header `0x5985d28`, phiên bản **16.0** | Trùng hằng số format trong .NET 10.0.0; dấu hiệu mạnh và có định dạng xác định hơn suy luận từ tên thư viện. |
| Giải dehydration ngoại tuyến | Đọc hết command stream, dựng 25454848 byte và 2352818 relocation; SHA-256 ảnh dẫn xuất `fea5b706975e059ffe95570544f47f77a2d3cb360d591b2732ac9ddd465ac10e` | Không thực thi GPM, không sửa tệp gốc; kết quả của helper Python riêng, không phải hỗ trợ canonical REA cho RTR16. |
| Chuỗi frozen đã phục hồi đúng cấu trúc | 33900 string object 8-byte aligned trong frozen region; MethodTable `0x1466dec08` (flags `0xd0040002`, base size 22, parent base size 24/related null) | Có cả chuỗi framework/diagnostic, không phải tất cả là nhãn UI. 370 ứng viên tiếng Việt được chọn bằng heuristic Unicode, ở bước quét ban đầu chưa ghép khóa locale với giá trị; bước mã máy bổ sung phía trên đã kiểm tra 547 cặp mỗi ngôn ngữ. |

Trình giải hydration bám [StartupCodeHelpers của .NET 10.0.0](https://github.com/dotnet/runtime/blob/v10.0.0/src/coreclr/nativeaot/Common/src/Internal/Runtime/CompilerHelpers/StartupCodeHelpers.cs), [ModuleHeaders cùng phiên bản](https://github.com/dotnet/runtime/blob/v10.0.0/src/coreclr/tools/Common/Internal/Runtime/ModuleHeaders.cs) và command encoding `DehydratedData.cs`. Resource index theo [AvaloniaResourcesIndexReaderWriter](https://github.com/AvaloniaUI/Avalonia/blob/main/src/Avalonia.Base/Utilities/AvaloniaResourcesIndex.cs). Phiên bản `main` của .NET hiện đã đổi header dehydration; không áp dụng nó trực tiếp cho mẫu RTR16.

## 2. Kiến trúc màn hình cần đối chiếu

Ảnh tài liệu chính thức do nhánh nghiên cứu web thu thập có ảnh ghi `v0.1.1-beta`, cũ hơn mẫu `5.1.2-stable`. Chúng có thể chứng minh cấu trúc và luồng ở phiên bản ảnh đó, không chứng minh pixel parity của phiên bản đích.

Các đường dẫn sau là **mapping class/resource quan sát được**, không phải tên tự đặt:

- MainWindow; ProfilePage và **TrashProfilePage tách riêng**.
- CreateOrUpdateProfilePage; CreateProfileByNumberPopup; ImportProfilePopup; ImportByExcelPopup; ExportProfilePopup.
- ArrangeBrowserWindow; SyncActionWindow; ColumnSettingPopup; ColorPickerPopup.
- GroupPage; ProxyPage; EnterProxyInput; SelectProxyPopup; RouteProxyConfigGuidePopup.
- ExtensionPage; SelectActiveGroupPopup.
- ApiPage; SettingPage; SupportPage; AppStorePage; OpenAutomatePopup; PluginPage; ChatBox.
- LoginPage; ChangeUserInfoPopup; StartupPage; EnterLicensePopup; SelectStorageTypePopup; AboutPage; ThanksModal.
- BackgroundTasksPopup; CloudSharePopup; NotificationPopup; ReleaseNotesWindow; ResourceDownloadPopup; UpdateAppPopup; UpdateManagerPopup.
- BackupPopup và IPv6CreatorPage/CreateIpV6Popup; các locale plugin Backup/ChangeStorageName/IPv6.
- Locale chính có `en-us`, `vi-vn`, `zh-cn`; ứng dụng có asset release notes và support JSON tương ứng ba ngôn ngữ.

MainWindow binding chứa các trạng thái Profile/Group/Proxy/Extension/Plugin/Trash/AppStore/API/Settings/MCP/About, tác vụ nền, thu gọn menu, đổi theme sáng/tối, đổi ngôn ngữ, mở log, đổi local/cloud DB và mở rộng hỗ trợ. **Thứ tự sidebar, icon, màu, khoảng cách, kích thước cửa sổ chưa được khôi phục từ binary**; cần đối chiếu ảnh hoặc runtime chính thức ở đúng phiên bản.

## 3. Các cụm điều khiển có surface binding xác định

| Màn hình | Binding quan sát được | Cách dùng để thiết kế bản thay thế |
| --- | --- | --- |
| Tạo/sửa profile | `ProfileDto`, `GroupItemsSource`, `RandomFingerprintCommand`, `SummaryItemsSource`, `IsEditProfile`, `BrowserTypeItemsSource`, `EnterProxyViewModel`, timezone/screen/WebGL vendor+renderer/CPU/device memory/browser version/OS/language, `IsMobile`, `IsShowOsWarning` | Không rút gọn trang này thành một form tên/URL/proxy. Cần khu tổng quan, chọn engine/version/OS và nhóm thiết lập fingerprint; chỉ bật các engine setting thực sự được hỗ trợ. Thứ tự/tab vẫn cần ảnh/runtime. |
| Bố trí cửa sổ | monitor, target scale, custom width/height, custom columns/rows, arrange mode, size mode, display-area X/Y/width/height, cập nhật tập profile chọn | Cần chọn màn hình và vùng làm việc, chế độ kích thước/bố trí, không chỉ một nút chia lưới trên màn hình chính. |
| Đồng bộ | start/pause/resume/stop, trạng thái, focus profile mở, cập nhật tập chọn, monitor, arrange mode, window scale, custom dimensions, startup URL, chọn/reset extension | Cần luồng chọn cửa sổ chính/phụ và trạng thái điều khiển rõ ràng. Binary không chứng minh mức hỗ trợ iframe/canvas/phím/clipboard; không coi DOM click/input là tương đương sync native. |
| Cài đặt | selected tab, GPU, drag-selection, LocalStorage path, private-server URL, automation path, proxy checker/ping, auto cache, auto browser resolution, restore session, startup URLs/args/bookmarks, fingerprint defaults, API URL/remote flag, MCP enable/URL/token/config copy | Cài đặt gốc rộng hơn trang token/API hiện tại. Phải phân tách lưu trữ, engine/defaults, API/MCP và automation trong đặc tả; endpoint/provider chưa xác minh không được hiển thị như hoạt động. |

## 4. Nhãn và chỉ dẫn khôi phục nguyên vẹn

Các chuỗi dưới đây là literal thật, đã phục hồi qua cấu trúc string, không phải bản dịch do người phân tích đặt:

- “Cài đặt”, “Cài đặt chung”, “Ghim lên đầu”.
- “Chế độ chọn: Quét chuột”, “Chế độ chọn: Truyền thống”.
- “Chọn các profile đang mở”, “Cập nhật URL khởi động”, “Chọn từ thư viện proxy”, “Chọn vị trí lưu trữ profile”.
- Chỉ dẫn bố trí cửa sổ nói tỉ lệ chỉ áp dụng cho profile được mở qua chức năng đó; với cửa sổ mở thủ công cần tỉ lệ 100.
- Chỉ dẫn tạo hàng loạt nêu ví dụ đánh số **Hello 001, Hello 002…**, không phải chỉ ghép số không đệm.
- Chỉ dẫn extension nói bản cài extension không đồng bộ qua Private Server; người dùng phải cài extension cần thiết ở menu Extension.
- Chỉ dẫn backup xác định giới hạn Local Storage và mô tả full restore bằng cách giải nén ZIP, đổi LocalStorage path rồi lưu/khởi động lại.
- Chuỗi API remote nêu cần quyền administrator khi bật truy cập Internet; không suy luận API public có thể được bật an toàn bằng cách chỉ đổi bind address.

Các literal giúp xác định **ý định và giới hạn tính năng**, nhưng chưa chứng minh người dùng thấy chúng ở view nào hoặc thao tác đó thực sự thành công. Khóa/giá trị locale hiện đã được ghép bằng lệnh truyền tham số, thay vì đoán theo khoảng cách trong bảng string interned; gắn từng khóa vào control/layout vẫn cần xref XAML và ảnh/runtime.

## 5. Assets cấu hình thật để tránh tự đoán

Chỉ mục ứng dụng chứa browser list, OS/mobile/screen/timezone/language datasets; WebGL metadata cho Windows/Linux/macOS Intel/macOS ARM/Android; hardware noise config; route-proxy/provider/checker config; server-data và samples JSON/Excel. Có release notes VN/EN/CN tới 5.1.2-stable. Các file này được trích với khoảng byte/hash xác định, vì vậy danh sách lựa chọn có thể được kiểm tra bằng dữ liệu thật thay vì tạo vài mục minh họa.

Tuy nhiên, cấu hình noise/WebGL **không phải bản patch engine**. Có menu chọn một giá trị không chứng minh Chromium/Electron tiêu chuẩn có thể áp dụng nó đúng với GPM. Không gọi URL hoặc dùng credential chỉ vì thấy trong assets. Không đưa logo/banner/font/tài nguyên proprietary vào bản thay thế chỉ để tăng độ giống; các hình được trích ở workspace chỉ làm tham chiếu phân tích.

## 6. Thứ tự tái dựng nên thực hiện

1. Lập mapping ảnh/video chính thức ở **đúng dòng 5.1.x** với 62 resource-path: mỗi màn hình có trạng thái rỗng, có dữ liệu, đang chạy và báo lỗi. Tách ảnh v4/cũ ra khỏi tiêu chuẩn nghiệm thu 5.1.2.
2. Lập đặc tả đầy đủ ProfileDto/browser/proxy và default/config persistence trước khi vẽ form; kiểm tra hành vi clone, clear-cache, export và import bằng tài liệu/runtime gốc. Sửa khác biệt hành vi trước khi thêm các trường fingerprint chỉ có giao diện.
3. Đã khôi phục cặp key/value ở ba ctor locale; tiếp tục lần xref từ các khóa sang XAML đã biên dịch/control để đặt đúng nơi và xác định layout. Bảng locale đầy đủ không tự chứng minh vị trí nút, tab hoặc command binding.
4. Tái dựng layout/flow các màn hình chính theo ảnh/runtime; dùng binding map để kiểm tra không bỏ command/state, không tự tuyên bố thứ tự từ danh sách metadata.
5. Nghiệm thu theo cặp input → state lưu → lệnh browser/API → kết quả observable trên Windows/macOS Intel. Phần engine/cloud phải có test thật hoặc ghi chưa hỗ trợ, không làm nút giả.

## 7. Tệp phân tích riêng trong workspace

Tất cả nằm dưới `/workspace/gpm-analysis/round2/ui/`:

- `avalonia-index.json`, `resources/...`, `class-resource-map.json`: tài nguyên và mapping XAML thật.
- `viewmodel-property-map.json`: 57 class/511 binding với byte offsets.
- `extract_avalonia.py`, `extract_ui_properties.py`: helper tái lập.
- `rehydrate_nativeaot.py`, `hydration-manifest.json`, `hydrated-data.bin`: ảnh dẫn xuất ngoại tuyến + nguồn định dạng upstream đã lưu.
- `copy-spans.bin`, `relocations.bin`: liên hệ từ ảnh dẫn xuất về command/copy/fixup trong binary gốc.
- `locale-call-validation.json`, `validate_locale_calls.py`: 1641 cặp ở ba hàm, call bytes/file offsets và kiểm tra độc lập với Ghidra. Toàn bộ bảng ở workspace riêng.
- `frozen-strings.json`, `vietnamese-label-candidates.json`: dữ liệu phân tích riêng, gồm chuỗi framework/diagnostic; **không phát hành hàng loạt các file này**.
- `exact-ui-literals.json`: 12 literal đã tuyển chọn, có address, source-copy spans, fixup và SHA.
- `visual-reference/`: 4 ảnh asset để xem nội bộ. `appbanner.png` là ảnh quảng bá/fingerprint-check websites, không phải ảnh layout ứng dụng.

Không sửa application source, không chạy GPM, không gọi backend và không publish trong nhánh công việc này.
