@echo off
title EphemPrint — Enable Permanent Server on Windows Startup
cd /d "%~dp0"

echo ========================================================================
echo   Setting up EphemPrint Server (http://localhost:8080) to run permanently
echo ========================================================================

powershell -Command "$startup = [Environment]::GetFolderPath('Startup'); $s = (New-Object -COM WScript.Shell).CreateShortcut($startup + '\EphemPrint_Server.lnk'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"c:\ephemprint\start_background.vbs\"'; $s.WorkingDirectory = 'c:\ephemprint'; $s.Save(); Write-Host 'Shortcut created in:' $startup -ForegroundColor Green"

echo.
echo ========================================================================
echo   Success! EphemPrint will now start silently in the background
echo   every time your PC turns on or reboots.
echo ========================================================================
pause
