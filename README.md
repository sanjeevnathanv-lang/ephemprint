# ⚡ EphemPrint — Zero-Trace Ephemeral P2P Exchange

> **Anonymous, zero-sign-in data exchange between Android and Windows devices via encrypted QR pairing.**

EphemPrint is an ultra-private, ephemeral data bridge running cross-platform on **Windows PC** and native **Android** (`EphemPrint.apk`). It allows two devices to instantly link, message, co-edit documents, stream file transfers, and exchange live camera snapshots without ever exchanging emails, phone numbers, or creating accounts.

---

## ✨ Core Features & Capabilities

### 1. 🔲 Instant QR Code Pairing
- **Zero Identification**: No phone numbers, email addresses, or user accounts required.
- **Dynamic Encrypted QR Code**: Generates a one-time cryptographic handshake token (`EPHEM-XXXXXX`).
- **In-App Camera Scanner**: Real-time camera viewfinder with animated laser guide, corner brackets, and front/rear lens switching.
- **PIN Code Fallback**: 6-character alphanumeric PIN for manual pairing when camera scanning is inconvenient.

### 2. ⚡ Dual-Engine Transport Layer
- **Direct WebRTC DataChannel**: Ultra-low-latency, zero-hop peer-to-peer data tunnel secured via DTLS/SCTP.
- **Volatile In-Memory RAM Relay**: Automatic seamless fallback via temporary RAM queues (`POST /api/session/send` & 85ms polling) for instant delivery across restrictive symmetric NATs and mobile cellular networks.
- **Zero Disk Writes**: In-memory buffers exist strictly in RAM and are permanently purged upon session termination.

### 3. 💬 Real-Time Ephemeral Chat
- Bidirectional messaging with timestamps and tactile Web Audio sound effects.
- Clean system notices for connection establishment and encryption confirmation.
- Delivered exclusively into device volatile memory.

### 4. 📁 File Transfer & Local Download
- Instant file streaming with live percentage progress bar and transfer speed indicators.
- Base64 chunk reconstruction into verified binary Blobs.
- One-tap local **Download** button on the receiving device to save files directly.
- Automatic image thumbnail previews for captured photos and documents.

### 5. 📷 Live Camera Snapshots
- Built-in camera viewfinder with simulated shutter flash and audio feedback.
- Instant photo preview, retake, and one-tap transmit directly into the peer's chat stream.
- Native Android camera capture integration (`capture="environment"`).

### 6. 📝 Live Collaborative Document Scratchpad
- Real-time collaborative markdown document editor with keystroke synchronization across both devices.
- Rich Markdown formatting tools (Bold, Italic, Heading, Checklist, Code Block).
- One-click export to local storage as `.md`.

### 7. 🔥 Mutual Session Termination (Kill Switch)
- Red top-right **Terminate** button and intuitive **Slide-to-Shred** gesture.
- **Mutual Destruction**: When either device triggers termination, both devices immediately receive the kill signal, sever WebRTC sockets, zero-fill all memory buffers, revoke local Object URLs, and return to the start screen with a shredder animation.

---

## 🎨 Design System

| Dimension | Specification |
|---|---|
| **Theme** | Light Neumorphic & High-Tech Clean (`#F4F8FC`, `#FFFFFF`) |
| **Accent Colors** | Royal Blue (`#0070F3`), Mint Green (`#10B981`), Crimson Red (`#EF4444`) |
| **Typography** | `Plus Jakarta Sans` for UI elements + `JetBrains Mono` for crypto tokens |
| **Windows Desktop UX** | Centered clean workspace container (`max-width: 680px`), mouse hover effects, keyboard shortcuts (`Enter` to send) |
| **Android Mobile UX** | Full-width responsive touch ergonomics, matching `#F4F8FC` light status bar with dark system icons (`View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR`) |
| **Audio FX Synthesizer** | Pure Web Audio API synthesized audio (zero external audio file dependencies) |

---

## 📱 Prebuilt Android APK

The native Android app is precompiled and included in the repository:
- **Download:** [`EphemPrint.apk`](EphemPrint.apk)
- Simply transfer `EphemPrint.apk` to your Android phone or install via ADB:
  ```bash
  adb install -r EphemPrint.apk
  ```

---

## 🚀 Running on Windows PC

### 1. Quick Start
Double-click [`start.bat`](start.bat) or run in your terminal:
```bash
node server.js
```
The server will start listening at:
- **PC Local Browser:** `http://localhost:8080`
- **Local Network / Wi-Fi:** `http://<YOUR_LAN_IP>:8080`

### 2. Run Permanently in the Background
- **Silent Background:** Double-click [`start_background.vbs`](start_background.vbs) to run the server silently with no console window.
- **Auto-Start on Windows Boot:** Double-click [`install_autostart.bat`](install_autostart.bat) to automatically start EphemPrint every time Windows starts up.

---

## 🔨 Building the Android APK from Source

Prerequisites: Android SDK build-tools and JDK / JBR installed.

Run the build script:
```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```
This script will:
1. Sync web assets (`index.html`, `style.css`, `app.js`, `vendor/`) to `android_project/assets/`.
2. Compile Java sources with `javac`.
3. Dex bytecode using `d8`.
4. Pack and align the APK with `aapt` and `zipalign`.
5. Sign the APK using `apksigner`.
6. Install and launch the application on any connected ADB Android device.

---

## 📄 License

MIT License. Free for open source use.
