# 🪁 KITE BROWSER (iOS & Mobile)

> **Trình duyệt tối giản triệt tiêu lớp phủ tàng hình, Pop-under & Cảnh báo VPN giả.**  
> Thiết kế chuẩn quốc tế theo tài liệu `WORKSPACE_DESIGN_AND_DEV_STANDARDS.md` (Anti-AI Design System): Nền obsidian `#09090b`, không viền loè loẹt, không icon lấp lánh AI, 100% vector Lucide.

---

## ⚡ 1. Các cơ chế bảo vệ cốt lõi

1. **Triệt tiêu lớp phủ tàng hình (Zero-Overlay Engine):**
   - Tự động phát hiện các thẻ `div`, `section` có `position: fixed/absolute` với `z-index >= 99` hoặc chiếm toàn màn hình làm đơ thao tác bấm.
   - Luôn bảo tồn thẻ `<video>` để đảm bảo không xóa nhầm trình phát phim.
   - Ép trang web luôn mở khóa cuộn (`overflow: auto !important`) và cho phép click (`pointer-events: auto !important`).
2. **Khóa Pop-under tầng nhân:**
   - Override `window.open` ngay từ `injectedJavaScriptBeforeContentLoaded`.
   - Chặn đứng 100% hành vi tự bật tab ngầm khi chạm vào màn hình.
3. **Bộ lọc tên miền & Schema ngoài:**
   - Chặn các redirect lén lút sang ứng dụng ngoài (`itms-services://`, `market://`, `intent://`, `tg://`).
   - Lọc bỏ các mạng quảng cáo rác (`propellerads`, `adsterra`, `popads`, `exoclick`, `monetag`, v.v.).
4. **Nút "Zap Overlay" khẩn cấp trên thanh điều hướng:**
   - Bấm 1 chạm để xóa ngay mọi lớp phủ che mắt khi trang web cố tình chèn script lách luật.

---

## 🚀 2. Hướng dẫn chạy thử trên Expo Go (SDK 57)

Dự án hiện tại đang được cấu hình ở **Expo SDK 57**:

1. Chạy file `run.bat` (hoặc mở terminal tại thư mục `Kite` và gõ):
   ```bash
   npm install
   npx expo start -c
   ```
2. Mở app **Expo Go** trên iPhone (đảm bảo iPhone và máy tính cùng mạng Wi-Fi), quét mã QR trên màn hình terminal để mở Kite Browser.
3. Bấm vào lối tắt **Donghua World** hoặc nhập bất kỳ trang web xem phim nào để trải nghiệm khả năng chặn đơ màn hình.

---

## 📦 3. Hướng dẫn chuyển về SDK 54 để xuất file `.ipa` qua GitHub Actions

Để các máy chủ macOS (`macos-14` + `Xcode 16.2`) trên GitHub Actions có thể build ra file `.ipa` mà không bị xung đột môi trường:

1. Chạy file **`switch-sdk.bat`** và chọn **số 2** (hoặc copy nội dung từ `package.sdk54.json` sang `package.json`).
2. Đẩy dự án lên GitHub cá nhân của bạn:
   ```bash
   git init
   git add .
   git commit -m "feat: setup Kite browser with SDK 54 for iOS IPA build"
   git branch -M main
   git remote add origin https://github.com/TÊN_CỦA_BẠN/Kite.git
   git push -u origin main
   ```
3. Vào tab **Actions** trên GitHub > chọn workflow **Build Kite iOS IPA** > Bấm **Run workflow**.
4. Sau khi build xong (khoảng 5 - 8 phút), tải file **`Kite-iOS-IPA`** từ mục **Artifacts**.

---

## 📲 4. Cài đặt vào iPhone bằng Sideloadly

1. Mở phần mềm **Sideloadly** trên máy tính.
2. Cắm cáp kết nối iPhone vào máy tính (chọn *Tin cậy máy tính này* trên iPhone).
3. Kéo thả file `Kite.ipa` vừa tải vào ô **IPA** trên Sideloadly.
4. Nhập tài khoản **Apple ID** của bạn vào ô *Apple account*.
5. Bấm **Start** và chờ Sideloadly nạp app vào iPhone.
6. Trên iPhone: Vào **Cài đặt** > **Cài đặt chung** > **Quản lý VPN & Thiết bị** > Bấm vào Apple ID của bạn và chọn **Tin cậy ứng dụng (Trust)** để mở app.
