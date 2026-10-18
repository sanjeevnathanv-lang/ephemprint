@echo off
title EphemPrint — APK Builder and USB Installer
cd /d "%~dp0"

echo ========================================================================
echo   Building and Installing EphemPrint.apk via USB
echo ========================================================================

powershell -ExecutionPolicy Bypass -Command ^
    "$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr';" ^
    "$BUILD_TOOLS = 'C:\Android\Sdk\build-tools\36.0.0';" ^
    "$PLATFORM_JAR = 'C:\Android\Sdk\platforms\android-34\android.jar';" ^
    "$PROJECT_DIR = 'c:\ephemprint\android_project';" ^
    "$ADB = 'c:\ephemprint\tools\platform-tools\adb.exe';" ^
    "Copy-Item 'c:\ephemprint\index.html', 'c:\ephemprint\style.css', 'c:\ephemprint\app.js', 'c:\ephemprint\manifest.json', 'c:\ephemprint\icon.svg' -Destination '$PROJECT_DIR\assets\' -Force;" ^
    "if (Test-Path 'c:\ephemprint\vendor') { Copy-Item 'c:\ephemprint\vendor' -Destination '$PROJECT_DIR\assets\' -Recurse -Force; };" ^
    "& '$BUILD_TOOLS\aapt.exe' package -f -m -J '$PROJECT_DIR\src' -M '$PROJECT_DIR\AndroidManifest.xml' -S '$PROJECT_DIR\res' -I $PLATFORM_JAR;" ^
    "$sources = (Get-ChildItem -Path '$PROJECT_DIR\src' -Filter '*.java' -Recurse | Select-Object -ExpandProperty FullName);" ^
    "& '$env:JAVA_HOME\bin\javac.exe' -d '$PROJECT_DIR\obj' -cp $PLATFORM_JAR --release 8 $sources;" ^
    "$classes = (Get-ChildItem -Path '$PROJECT_DIR\obj' -Filter '*.class' -Recurse | Select-Object -ExpandProperty FullName);" ^
    "& '$BUILD_TOOLS\d8.bat' --lib $PLATFORM_JAR --output '$PROJECT_DIR' $classes;" ^
    "& '$BUILD_TOOLS\aapt.exe' package -f -M '$PROJECT_DIR\AndroidManifest.xml' -S '$PROJECT_DIR\res' -A '$PROJECT_DIR\assets' -I $PLATFORM_JAR -F '$PROJECT_DIR\ephemprint.unaligned.apk';" ^
    "Push-Location $PROJECT_DIR; & '$BUILD_TOOLS\aapt.exe' add 'ephemprint.unaligned.apk' 'classes.dex'; Pop-Location;" ^
    "& '$BUILD_TOOLS\zipalign.exe' -f -p 4 '$PROJECT_DIR\ephemprint.unaligned.apk' '$PROJECT_DIR\ephemprint.aligned.apk';" ^
    "& '$BUILD_TOOLS\apksigner.bat' sign --ks '$PROJECT_DIR\debug.keystore' --ks-pass pass:android --min-sdk-version 24 --out 'c:\ephemprint\EphemPrint.apk' '$PROJECT_DIR\ephemprint.aligned.apk';" ^
    "& $ADB install -r 'c:\ephemprint\EphemPrint.apk';" ^
    "& $ADB shell am start -n com.ephemprint.app/.MainActivity;"

echo.
echo ========================================================================
echo   Done! EphemPrint is running on your Android device.
echo ========================================================================
pause
