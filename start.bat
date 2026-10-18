@echo off
title EphemPrint — Real P2P Mobile & Desktop Bridge
cd /d "%~dp0"

echo ========================================================================
echo   Starting EphemPrint Real P2P Server for Android and Windows...
echo ========================================================================

where node >nul 2>nul
if %errorlevel% equ 0 (
    node server.js
    pause
    exit /b
)

where python >nul 2>nul
if %errorlevel% equ 0 (
    echo Node.js not detected, starting via Python 3...
    python -m http.server 8080 --bind 0.0.0.0
    pause
    exit /b
)

echo Warning: Neither Node.js nor Python was found in your PATH.
echo You can still open index.html directly in your browser.
start "" index.html
pause
