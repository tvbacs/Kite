@echo off
chcp 65001 > nul
echo ========================================================
echo   KITE BROWSER - CHUYỂN ĐỔI PHIÊN BẢN EXPO SDK
echo ========================================================
echo.
echo [1] Chuyển sang SDK 57 (Để chạy thử trên app Expo Go)
echo [2] Chuyển sang SDK 54 (Để push lên GitHub chạy macos-14 Xcode build IPA)
echo.
set /p choice="Nhập lựa chọn của bạn (1 hoặc 2): "

if "%choice%"=="1" (
    echo.
    echo [*] Đang chuyển sang Expo SDK 57...
    copy /y package.json package.backup.json > nul
    copy /y package.sdk57.json package.json > nul
    echo [OK] Đã chuyển sang SDK 57 thành công!
    echo Hãy chạy 'npm install' và 'npx expo start -c' để kiểm tra trên Expo Go.
) else if "%choice%"=="2" (
    echo.
    echo [*] Đang chuyển sang Expo SDK 54...
    copy /y package.json package.sdk57.json > nul
    copy /y package.sdk54.json package.json > nul
    echo [OK] Đã chuyển sang SDK 54 thành công!
    echo Bây giờ bạn có thể commit và push lên GitHub để GitHub Actions build file IPA.
) else (
    echo Lựa chọn không hợp lệ.
)
pause
