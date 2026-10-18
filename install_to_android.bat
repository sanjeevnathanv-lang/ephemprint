@echo off
title EphemPrint — USB Android Installer & Bridge
cd /d "%~dp0"

set ADB=c:\ephemprint\tools\platform-tools\adb.exe

echo ========================================================================
echo   EphemPrint — USB Android Auto-Installer & Launcher
echo ========================================================================
echo.

:CHECK_DEVICE
echo Checking for connected Android device via USB...
%ADB% devices

echo.
echo If your device says "unauthorized", check your phone screen and tap "ALLOW".
echo If no device is listed, make sure USB Debugging is turned ON in:
echo   Settings -^> System -^> Developer options -^> USB Debugging
echo.
pause

%ADB% get-state >nul 2>nul
if %errorlevel% neq 0 (
    echo Device not authorized or not detected yet. Retrying...
    goto CHECK_DEVICE
)

echo [1/3] Device detected! Reverse forwarding port 8080 over USB cable...
%ADB% reverse tcp:8080 tcp:8080

echo [2/3] Launching local Node.js server...
start /b node server.js

timeout /t 2 >nul

echo [3/3] Opening EphemPrint on your Android phone via USB...
%ADB% shell am start -a android.intent.action.VIEW -d "http://localhost:8080"

echo.
echo ========================================================================
echo   SUCCESS! EphemPrint is now open on your Android phone over USB.
echo.
echo   To install it as an App on your phone:
echo   - In Chrome, tap the 3 dots in the top right corner.
echo   - Tap "Install app" or "Add to Home screen".
echo   - EphemPrint will now be installed as a standalone app on your phone!
echo ========================================================================
echo.
pause
