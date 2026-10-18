$ErrorActionPreference = 'Stop'

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  Compiling and Installing EphemPrint Native Android APK" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$BUILD_TOOLS = "C:\Android\Sdk\build-tools\36.0.0"
$PLATFORM_JAR = "C:\Android\Sdk\platforms\android-34\android.jar"
$PROJECT_DIR = "c:\ephemprint\android_project"
$ADB = "c:\ephemprint\tools\platform-tools\adb.exe"

# 1. Sync updated web assets into APK assets
Write-Host "[1/7] Syncing web assets..." -ForegroundColor Yellow
Copy-Item "c:\ephemprint\index.html", "c:\ephemprint\style.css", "c:\ephemprint\app.js", "c:\ephemprint\manifest.json", "c:\ephemprint\icon.svg" -Destination "$PROJECT_DIR\assets\" -Force
if (Test-Path "c:\ephemprint\vendor") {
    Copy-Item "c:\ephemprint\vendor" -Destination "$PROJECT_DIR\assets\" -Recurse -Force
}

# 2. AAPT package resources to generate R.java
Write-Host "[2/7] Generating resource classes (AAPT)..." -ForegroundColor Yellow
& "$BUILD_TOOLS\aapt.exe" package -f -m -J "$PROJECT_DIR\src" -M "$PROJECT_DIR\AndroidManifest.xml" -S "$PROJECT_DIR\res" -I $PLATFORM_JAR

# 3. Compile Java sources
Write-Host "[3/7] Compiling Java sources (javac)..." -ForegroundColor Yellow
if (!(Test-Path "$PROJECT_DIR\obj")) { New-Item -ItemType Directory -Path "$PROJECT_DIR\obj" -Force | Out-Null }
$sources = (Get-ChildItem -Path "$PROJECT_DIR\src" -Filter "*.java" -Recurse | Select-Object -ExpandProperty FullName)
& "$env:JAVA_HOME\bin\javac.exe" -d "$PROJECT_DIR\obj" -cp $PLATFORM_JAR --release 8 $sources

# 4. Convert classes to Dalvik executable (D8)
Write-Host "[4/7] Dexing bytecode (D8)..." -ForegroundColor Yellow
$classes = (Get-ChildItem -Path "$PROJECT_DIR\obj" -Filter "*.class" -Recurse | Select-Object -ExpandProperty FullName)
& "$BUILD_TOOLS\d8.bat" --lib $PLATFORM_JAR --output "$PROJECT_DIR" $classes

# 5. Pack APK with AAPT
Write-Host "[5/7] Packing APK bundle..." -ForegroundColor Yellow
$unalignedApk = "$PROJECT_DIR\ephemprint.unaligned.apk"
$alignedApk = "$PROJECT_DIR\ephemprint.aligned.apk"
$finalApk = "c:\ephemprint\EphemPrint.apk"

if (Test-Path $unalignedApk) { Remove-Item $unalignedApk -Force }
if (Test-Path $alignedApk) { Remove-Item $alignedApk -Force }

& "$BUILD_TOOLS\aapt.exe" package -f -M "$PROJECT_DIR\AndroidManifest.xml" -S "$PROJECT_DIR\res" -A "$PROJECT_DIR\assets" -I $PLATFORM_JAR -F $unalignedApk
Push-Location $PROJECT_DIR
& "$BUILD_TOOLS\aapt.exe" add "ephemprint.unaligned.apk" "classes.dex"
Pop-Location

# 6. Align and Sign APK
Write-Host "[6/7] Aligning and signing APK..." -ForegroundColor Yellow
& "$BUILD_TOOLS\zipalign.exe" -f -p 4 $unalignedApk $alignedApk
& "$BUILD_TOOLS\apksigner.bat" sign --ks "$PROJECT_DIR\debug.keystore" --ks-pass pass:android --min-sdk-version 24 --out $finalApk $alignedApk

# 7. Install via ADB & Launch
Write-Host "[7/7] Installing EphemPrint on connected Android device via ADB..." -ForegroundColor Yellow
& $ADB install -r $finalApk
& $ADB reverse tcp:8080 tcp:8080
& $ADB shell am start -n com.ephemprint.app/.MainActivity

Write-Host "========================================================================" -ForegroundColor Green
Write-Host "  Success! EphemPrint has been compiled, installed, and launched!" -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Green
