# Phục hồi dữ liệu NativeAOT và nhãn ngôn ngữ

## Đích và ranh giới

Đích là đúng `GPMLoginGlobal.exe` trích từ bộ cài được cung cấp, SHA-256 `4395e4ed3a3548465c0f339f4e522ead0e9faa9adabb0dadcb73f63bd7a8688e`. Không chạy chương trình GPM; không sửa byte đầu vào. Tất cả memory overlay và pseudocode bên dưới là ảnh dẫn xuất phục vụ phân tích tĩnh.

PE không có CLI/CIL thông thường. Header RTR tại file offset `0x5985d28` có version16.0. Header/module layout và stream dehydration khớp định dạng NativeAOT.NET10; đối chiếu nguồn [.NET10 StartupCodeHelpers](https://github.com/dotnet/runtime/blob/v10.0.0/src/coreclr/nativeaot/Common/src/Internal/Runtime/CompilerHelpers/StartupCodeHelpers.cs). Vì vậy chỉ quét `strings -el` không đủ: dữ liệu chưa rehydrate có thể thiếu các zero byte hoặc pointer fixup, làm hỏng ký tự/cuối chuỗi.

## Kết quả ngoại tuyến

| Thành phần | Kết quả quan sát |
| --- | --- |
| Dehydrated stream | 11.925.088 byte tại file offset81699992 |
| Derived image | 25.454.848 byte, baseVA **`0x145f22030`** |
| Derived SHA-256 | `fea5b706975e059ffe95570544f47f77a2d3cb360d591b2732ac9ddd465ac10e` |
| Relocations | 2.352.818 bản ghi; stream được tiêu thụ hết theo decoder |
| String table | 33.900 string có typed MethodTable, chiều dài, UTF16 và alignment được kiểm tra |
| Surface UI | 57 bindingclass/511property-command; 62 ánh xạ class→XAML |

Đây là parser và script shell/Python riêng, **không phải REA Evidence chuẩn về hỗ trợ.NET10**. Parser NativeAOT tích hợp của REA6.7.0 chỉ hỗ trợ RTR9.1/.NET8, không được đổi tên thành đã hỗ trợ16.0.

## Decompile có phạm vi và đối chiếu byte gốc

Đã chuẩn bị Ghidra12.1.4 và fullJDK21.0.13 từ release chính thức, kiểm tra SHA-256 theo digest của asset trên GitHub trước khi dùng. REA doctor xác nhận provider và JDK phù hợp.

Lần gọi REA decompile với auto-analysis toàn bộ native app vượt deadline330000ms. **Không có kết quả phân tích toàn bộ callgraph thành công từ lần đó.** Để trả lời câu hỏi nhãn locale, chuyển sang script Ghidra headless có phạm vi: import PE read-only, không auto-analyze toàn chương trình; overlay ảnh derived đã xác định; disassemble/decompile hai hàm được chọn từ xrefstring và ranh giới `.pdata`. Ghidra không thực thi mã của target.

| Hàm VA | Bằng chứng nhận diện | Kết quả |
| --- | --- | --- |
| `0x140a2e608` | Tham chiếu URI `avares://GPMLoginGlobal/Locales/en-us.axaml` | 547cặp key/value EN |
| `0x140a34928` | Tham chiếu URI `avares://GPMLoginGlobal/Locales/vi-vn.axaml` | 547cặp key/value VI |
| `0x140a3ac48` | Hàm localeZH, literal tiếngTrung và cùng resource-registration callshape | 547cặp key/value ZH được kiểm tra trực tiếp từ instructions |

Hai pseudocode có cùng callee `0x1416b18a0` nhận pointerkey/pointervalue trong RDX/R8 cùng tham số2 trongR9D. Giá trị string được giải bằng địa chỉ object đã phục hồi, không ghép do chúng đứng cạnh nhau trong file.

Kiểm tra độc lập dùng Capstone trên **byte PE gốc**, theo ranh giới function trong`.pdata`: từng call có chuỗi `LEA RDX(key)`, `LEA R8(value)`, `MOV R9D,2` phù hợp. Coverage **547/547 cho mỗi locale**, tổng1641cặp và cùng tập547khóa. TiếngTrung đảo thứ tự hai khóa Running/ReleaseStatus; vì vậy không zip các array theo vị trí.

Ví dụ ngắn xác nhận pairing:

| Key | EN | VI | ZH |
| --- | --- | --- | --- |
| Save | Save | Lưu | 保存 |

Không đưa toàn bộ bảng ngôn ngữ hoặc nội dung trợ giúp nguyên bản lên repo công khai. Mapping toàn bộ, địa chỉ, raw call bytes và parser được giữ trong workspace để tái kiểm tra.

## Kiểm tra sửa sai và provenance

Trong lượt Ghidra đầu có lỗi chuyển base từ decimal sang hex, dùng overlay `0x145f1dc30`. Lượt đó đã được đánh dấu **superseded**. Đã chạy lại hai hàm với base lấy trực tiếp từ manifest `0x145f22030` và đối chiếu: toàn bộ547cặpEN +547cặpVI không thay đổi. Lý do pairing vẫn có thể kiểm tra độc lập là các lệnh LEA/call dùng địa chỉ literal trong byte code gốc, không phụ thuộc đọc nội dung overlay ở offset nhầm. Không dùng lượt superseded để kết luận về các object/thuật toán khác.

Bằng chứng riêng:

- `round2/ui/hydration-manifest.json`, `hydrated-data.bin`, `frozen-strings.json`.
- `round2/ui/locale-call-validation.json`, `validate_locale_calls.py`: fileoffset, VA và instructionbytes.
- `round2/native/selected-string-xrefs.json`: phạm vi REXMOV/LEA RIP-relative; không phải fullxrefgraph.
- `round2/native/focused-ghidra.log`, `FocusedLocales.java`, hai file`*_locale_candidate.c` và `locale-key-value-pairs.json`: lượt overlay đúng.
- `round2/native/locale-decompile-evidence.json`: kết quả **timeout** của lượt REA toàn chương trình, không phải pseudocode thành công.

## Những gì chưa phục hồi

547khóa locale không cho biết chính xác control nào dùng từngkey ở mọi trạng thái. Chưa khôi phục toàn bộ compiledXAML tree, kích thước/màu/style/theme hay mãC# gốc. Chưa decompile thuật toán fingerprint/noise/seed, toàn bộ browserlauncher, khóa đồng bộ cloud, license hoặc toàn bộ chương trình. Tên hàm `candidate`/`FUN_...` trong phân tích không phải tên source gốc.

Kết quả này đủ để loại bỏ nhiều phỏng đoán về nhãn/thông báo và định hướng UI; nó không phải chứng minh tương đương runtime hoặc 100% sản phẩm.
