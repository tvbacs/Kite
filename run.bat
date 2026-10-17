@echo off
chcp 65001 > nul
echo ========================================================
echo   KITE BROWSER - KHỞI CHẠY EXPO GO (DEV SERVER)
echo ========================================================
echo.
cd /d %~dp0
echo [*] Đang kiểm tra node_modules...
if not exist node_modules (
    echo [*] Đang cài đặt thư viện cho dự án...
    call npm install
)

echo.
echo [*] Khởi chạy Metro Bundler với cờ xóa cache...
call npx expo start -c
pause
