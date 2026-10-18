/**
 * EphemPrint — Real Zero-Trace Ephemeral P2P Engine
 * Dual-Engine Architecture: Direct WebRTC DataChannel + Volatile RAM Relay Fallback
 * Immediate QR redirection, Real Chat, File Transfer & Download, Live Snaps, Collaborative Doc, Mutual Kill Switch
 */

(function () {
  'use strict';

  // ==========================================
  // CONFIGURATION & STUN SERVERS
  // ==========================================
  const CHUNK_SIZE = 48 * 1024; // 48KB base64 chunk streaming
  const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const LOCAL_DEVICE_NAME = IS_MOBILE ? 'Android Phone' : 'Windows PC';

  const PEER_CONFIG = {
    debug: 1,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' }
      ]
    }
  };

  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const state = {
    peer: null,
    conn: null,
    isHost: false,
    role: 'host', // 'host' or 'peer'
    isConnected: false,
    sessionId: null,
    peerDeviceName: 'Remote Peer',
    soundEnabled: true,

    // Relay Server Configuration
    relayUrl: '',
    serverLanUrl: '',
    pollTimer: null,
    seenPacketIds: new Set(),

    // Camera streams
    scannerStream: null,
    scannerAnimId: null,
    scannerFacingMode: 'environment',

    modalCamStream: null,
    modalCamFacingMode: 'environment',
    capturedSnapBlob: null,

    // File transfers
    incomingTransfers: {}, // id -> { name, size, mime, chunks: [], received: 0 }
    sessionFiles: [],

    // Live collaborative document
    documentContent: `# Ephemeral Session Scratchpad\n\n- Paired via QR handshake.\n- Real-time zero-trace synchronization.\n- All data exists strictly in device volatile memory.`,
    docSyncTimer: null
  };

  // ==========================================
  // AUDIO FX SYNTHESIZER (Web Audio API)
  // ==========================================
  const AudioFX = {
    ctx: null,
    init() {
      if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
    },
    beep(freq = 440, type = 'sine', duration = 0.08, gainVal = 0.05) {
      if (!state.soundEnabled) return;
      try {
        this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (e) {}
    },
    click() { this.beep(850, 'triangle', 0.03, 0.03); },
    chime() {
      if (!state.soundEnabled) return;
      setTimeout(() => this.beep(523.25, 'sine', 0.1, 0.08), 0);
      setTimeout(() => this.beep(659.25, 'sine', 0.12, 0.08), 90);
      setTimeout(() => this.beep(783.99, 'sine', 0.22, 0.08), 180);
    },
    messagePop() { this.beep(960, 'sine', 0.05, 0.04); },
    shutter() {
      this.beep(240, 'square', 0.03, 0.08);
      setTimeout(() => this.beep(1200, 'sine', 0.05, 0.06), 40);
    },
    purge() {
      if (!state.soundEnabled) return;
      this.beep(160, 'sawtooth', 0.35, 0.12);
      setTimeout(() => this.beep(80, 'sawtooth', 0.45, 0.15), 180);
    }
  };

  // ==========================================
  // DOM ELEMENT SELECTORS
  // ==========================================
  const el = {
    // Header
    btnHeaderLogo: document.getElementById('btnHeaderLogo'),
    headerSessionStatus: document.getElementById('headerSessionStatus'),
    activePeerName: document.getElementById('activePeerName'),
    btnSoundToggle: document.getElementById('btnSoundToggle'),
    soundIcon: document.getElementById('soundIcon'),
    btnTerminateSession: document.getElementById('btnTerminateSession'),

    // Screens
    viewChoice: document.getElementById('viewChoice'),
    viewShowQR: document.getElementById('viewShowQR'),
    viewScanQR: document.getElementById('viewScanQR'),
    viewChat: document.getElementById('viewChat'),

    // Screen 1: Choice buttons
    btnSelectShowQR: document.getElementById('btnSelectShowQR'),
    btnSelectScanQR: document.getElementById('btnSelectScanQR'),

    // Screen 2A: Show QR
    btnBackFromShowQR: document.getElementById('btnBackFromShowQR'),
    qrCodeContainer: document.getElementById('qrCodeContainer'),
    sessionTokenDisplay: document.getElementById('sessionTokenDisplay'),
    btnCopySessionLink: document.getElementById('btnCopySessionLink'),
    p2pHostStatus: document.getElementById('p2pHostStatus'),

    // Screen 2B: Scan QR
    btnBackFromScanQR: document.getElementById('btnBackFromScanQR'),
    scannerVideo: document.getElementById('scannerVideo'),
    scannerCanvas: document.getElementById('scannerCanvas'),
    scannerStatusText: document.getElementById('scannerStatusText'),
    btnFlipScannerCam: document.getElementById('btnFlipScannerCam'),
    inputManualPin: document.getElementById('inputManualPin'),
    btnConnectByPin: document.getElementById('btnConnectByPin'),

    // Screen 3: Chat Workspace
    chatTargetSession: document.getElementById('chatTargetSession'),
    chatMessagesStream: document.getElementById('chatMessagesStream'),
    chatFileInput: document.getElementById('chatFileInput'),
    btnOpenSnapModal: document.getElementById('btnOpenSnapModal'),
    btnOpenNotesModal: document.getElementById('btnOpenNotesModal'),
    chatForm: document.getElementById('chatForm'),
    chatInput: document.getElementById('chatInput'),
    btnSendChat: document.getElementById('btnSendChat'),

    // Modal: Camera Snap
    modalCamera: document.getElementById('modalCamera'),
    btnCloseCameraModal: document.getElementById('btnCloseCameraModal'),
    modalCameraVideo: document.getElementById('modalCameraVideo'),
    modalCameraCanvas: document.getElementById('modalCameraCanvas'),
    modalSnapPreviewOverlay: document.getElementById('modalSnapPreviewOverlay'),
    modalSnapPreviewImg: document.getElementById('modalSnapPreviewImg'),
    btnRetakeModalSnap: document.getElementById('btnRetakeModalSnap'),
    btnSendModalSnap: document.getElementById('btnSendModalSnap'),
    btnFlipModalCamera: document.getElementById('btnFlipModalCamera'),
    btnTriggerModalShutter: document.getElementById('btnTriggerModalShutter'),
    nativeCameraFileInput: document.getElementById('nativeCameraFileInput'),

    // Modal: Notes / Collaborative Document
    modalNotes: document.getElementById('modalNotes'),
    btnCloseNotesModal: document.getElementById('btnCloseNotesModal'),
    docTitleInput: document.getElementById('docTitleInput'),
    liveDocumentEditor: document.getElementById('liveDocumentEditor'),
    fmtButtons: document.querySelectorAll('.fmt-btn'),
    btnDownloadDoc: document.getElementById('btnDownloadDoc'),
    btnClearDoc: document.getElementById('btnClearDoc'),
    docCharCount: document.getElementById('docCharCount'),

    // Modal: Terminate
    terminateModal: document.getElementById('terminateModal'),
    btnCancelTerminate: document.getElementById('btnCancelTerminate'),
    btnConfirmTerminateFast: document.getElementById('btnConfirmTerminateFast'),
    slideTrack: document.getElementById('slideTrack'),
    slideThumb: document.getElementById('slideThumb'),
    purgeScreen: document.getElementById('purgeScreen'),
    toastContainer: document.getElementById('toastContainer')
  };

  // ==========================================
  // INITIALIZATION & SERVER DISCOVERY
  // ==========================================
  async function init() {
    bindEvents();
    refreshIcons();

    // Auto-discover the active server relay endpoint
    await resolveRelayUrl();

    // Check if opened via URL hash (e.g. from scanning with Android external camera app)
    const hash = window.location.hash.replace('#', '').trim().toLowerCase();
    if (hash && (hash.startsWith('ephem-') || /^[a-z0-9]{6}$/.test(hash))) {
      const targetPin = hash.startsWith('ephem-') ? hash : `ephem-${hash}`;
      showToast(`Auto-connecting to ${targetPin.toUpperCase()}...`);
      connectToRemotePeer(targetPin);
    } else {
      switchScreen('choice');
    }

    window.addEventListener('hashchange', () => {
      const newHash = window.location.hash.replace('#', '').trim().toLowerCase();
      if (newHash && (newHash.startsWith('ephem-') || /^[a-z0-9]{6}$/.test(newHash))) {
        const targetPin = newHash.startsWith('ephem-') ? newHash : `ephem-${newHash}`;
        connectToRemotePeer(targetPin);
      }
    });
  }

  async function resolveRelayUrl() {
    const candidates = [];
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      candidates.push(window.location.origin);
    }
    // Android reverse USB bridge and common LAN ports
    candidates.push('http://127.0.0.1:8080');
    candidates.push('http://172.24.247.205:8080');
    candidates.push('http://localhost:8080');

    for (const url of candidates) {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 1200);
        const res = await fetch(`${url}/api/info`, { signal: controller.signal });
        clearTimeout(id);
        if (res.ok) {
          const info = await res.json();
          state.relayUrl = url;
          if (info.localIp && info.port) {
            state.serverLanUrl = `http://${info.localIp}:${info.port}`;
          }
          return url;
        }
      } catch (e) {}
    }

    state.relayUrl = candidates[0] || 'http://127.0.0.1:8080';
    return state.relayUrl;
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function switchScreen(screenName) {
    el.viewChoice?.classList.remove('active');
    el.viewShowQR?.classList.remove('active');
    el.viewScanQR?.classList.remove('active');
    el.viewChat?.classList.remove('active');

    if (screenName === 'choice') {
      el.viewChoice?.classList.add('active');
      el.headerSessionStatus?.classList.add('hidden');
      el.btnTerminateSession?.classList.add('hidden');
    } else if (screenName === 'showQR') {
      el.viewShowQR?.classList.add('active');
      el.headerSessionStatus?.classList.add('hidden');
      el.btnTerminateSession?.classList.add('hidden');
    } else if (screenName === 'scanQR') {
      el.viewScanQR?.classList.add('active');
      el.headerSessionStatus?.classList.add('hidden');
      el.btnTerminateSession?.classList.add('hidden');
    } else if (screenName === 'chat') {
      el.viewChat?.classList.add('active');
      el.headerSessionStatus?.classList.remove('hidden');
      el.btnTerminateSession?.classList.remove('hidden');
      if (el.chatTargetSession && state.sessionId) {
        el.chatTargetSession.textContent = state.sessionId.toUpperCase();
      }
    }

    refreshIcons();
  }

  // ==========================================
  // DUAL-ENGINE TRANSPORT LAYER
  // ==========================================
  async function initRelaySession(sessionId) {
    if (!state.relayUrl) await resolveRelayUrl();
    try {
      await fetch(`${state.relayUrl}/api/session/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
    } catch (e) {
      console.warn('Relay init error:', e);
    }
  }

  function startRelayPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);

    state.pollTimer = setInterval(async () => {
      if (!state.sessionId) return;
      try {
        const url = `${state.relayUrl}/api/session/poll?sessionId=${encodeURIComponent(state.sessionId)}&role=${state.role}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();

        if (data.terminated) {
          handlePeerTerminated();
          return;
        }

        if (Array.isArray(data.packets) && data.packets.length > 0) {
          for (const packet of data.packets) {
            handleIncomingPacket(packet);
          }
        }
      } catch (err) {
        // Transient network jitter, keep polling
      }
    }, 85); // 85ms ultra-responsive polling interval
  }

  function sendPacket(packet) {
    if (!packet.uid) {
      packet.uid = 'p_' + Math.random().toString(36).substring(2, 9) + Date.now();
    }

    let sentWebRTC = false;
    if (state.conn && state.conn.open) {
      try {
        state.conn.send(packet);
        sentWebRTC = true;
      } catch (e) {
        console.warn('WebRTC send error:', e);
      }
    }

    // Always send over relay if WebRTC is not open, or if mission-critical packet
    if (!sentWebRTC || packet.type === 'TERMINATE' || packet.type === 'HANDSHAKE' || !state.isConnected) {
      sendPacketViaRelay(packet);
    }
  }

  async function sendPacketViaRelay(packet) {
    if (!state.sessionId || !state.relayUrl) return;
    try {
      await fetch(`${state.relayUrl}/api/session/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.sessionId,
          from: state.role,
          packet: packet
        })
      });
    } catch (err) {
      console.warn('Relay packet send error:', err);
    }
  }

  // ==========================================
  // MODE 1: SHOW MY QR (HOST INITIALIZATION)
  // ==========================================
  async function handleSelectShowQR() {
    AudioFX.click();
    state.isHost = true;
    state.role = 'host';
    state.sessionId = generateSessionId();

    switchScreen('showQR');
    updateSessionTokenDisplay(state.sessionId);
    renderQRCode(state.sessionId);

    // Register on zero-trace relay
    await initRelaySession(state.sessionId);
    startRelayPolling();

    // Initialize WebRTC Host Peer
    initHostPeer(state.sessionId);
  }

  function generateSessionId() {
    const chars = '23456789abcdefghjkmnpqrstuvwxyz';
    let id = 'ephem-';
    for (let i = 0; i < 6; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  function updateSessionTokenDisplay(id) {
    if (el.sessionTokenDisplay) {
      el.sessionTokenDisplay.textContent = id.toUpperCase();
    }
    if (el.p2pHostStatus) {
      el.p2pHostStatus.textContent = 'Ready for connection. Point partner device to scan.';
    }
  }

  function renderQRCode(sessionId) {
    if (!el.qrCodeContainer) return;
    try {
      // In standalone APK or web, QR code encodes full pairing link including server host hint
      const baseUrl = state.serverLanUrl || (window.location.protocol.startsWith('http') ? window.location.origin : 'http://172.24.247.205:8080');
      const qrPayload = `${baseUrl}#${sessionId}`;

      if (typeof qrcode !== 'undefined') {
        const qr = qrcode(0, 'M');
        qr.addData(qrPayload);
        qr.make();
        el.qrCodeContainer.innerHTML = qr.createSvgTag(5, 0);
      }
    } catch (e) {
      console.warn('QR render error:', e);
    }
  }

  function initHostPeer(sessionId) {
    if (typeof Peer === 'undefined') {
      setTimeout(() => initHostPeer(sessionId), 600);
      return;
    }

    if (state.peer) {
      try { state.peer.destroy(); } catch (e) {}
      state.peer = null;
    }

    try {
      state.peer = new Peer(sessionId, PEER_CONFIG);

      state.peer.on('open', (id) => {
        state.sessionId = id;
        updateSessionTokenDisplay(id);
      });

      // Peer connected! Immediately redirect host to temporary chat session
      state.peer.on('connection', (conn) => {
        switchScreen('chat');
        if (el.activePeerName) {
          el.activePeerName.textContent = 'Peer Connected';
        }
        setupDataConnection(conn);
      });

      state.peer.on('error', (err) => {
        console.warn('Host PeerJS notice:', err);
        if (err.type === 'unavailable-id') {
          state.sessionId = generateSessionId();
          initHostPeer(state.sessionId);
        }
      });
    } catch (e) {
      console.error('Error starting host peer:', e);
    }
  }

  // ==========================================
  // MODE 2: SCAN THE QR (CAMERA QR SCANNER)
  // ==========================================
  function handleSelectScanQR() {
    AudioFX.click();
    state.isHost = false;
    state.role = 'peer';
    switchScreen('scanQR');
    startQRScannerCamera();
  }

  async function startQRScannerCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (el.scannerStatusText) el.scannerStatusText.textContent = 'Camera not available. Use PIN below.';
      return;
    }

    try {
      if (el.scannerStatusText) el.scannerStatusText.textContent = 'Align QR code in view...';

      state.scannerStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: state.scannerFacingMode }
      });

      if (el.scannerVideo) {
        el.scannerVideo.srcObject = state.scannerStream;
        el.scannerVideo.classList.remove('hidden');
        el.scannerVideo.play().catch(() => {});
      }

      requestAnimationFrame(scanQRCodeFrame);
    } catch (err) {
      console.warn('Camera error:', err);
      if (el.scannerStatusText) el.scannerStatusText.textContent = 'Camera access blocked. Enter PIN below.';
    }
  }

  function scanQRCodeFrame() {
    if (!state.scannerStream || !el.scannerVideo || !el.scannerCanvas) return;

    const video = el.scannerVideo;
    const canvas = el.scannerCanvas;
    const ctx = canvas.getContext('2d');

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      if (typeof jsQR !== 'undefined') {
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });

        if (code && code.data) {
          handleDetectedQRCode(code.data);
          return; // Stop scanning loop
        }
      }
    }

    state.scannerAnimId = requestAnimationFrame(scanQRCodeFrame);
  }

  function handleDetectedQRCode(rawData) {
    AudioFX.chime();
    stopQRScannerCamera();

    let targetToken = rawData.trim();
    let detectedHost = '';

    // Extract target session token and optional host address from QR payload
    if (targetToken.includes('http://') || targetToken.includes('https://')) {
      try {
        const urlObj = new URL(targetToken);
        detectedHost = urlObj.origin;
        if (urlObj.hash) {
          targetToken = urlObj.hash.replace('#', '').trim();
        }
      } catch (e) {}
    }

    const match = targetToken.match(/ephem-[a-z0-9]+/i);
    if (match) {
      targetToken = match[0].toLowerCase();
    } else if (targetToken.includes('#')) {
      targetToken = targetToken.split('#')[1].trim().toLowerCase();
    } else {
      targetToken = targetToken.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
    }

    if (detectedHost) {
      state.relayUrl = detectedHost;
    }

    // Immediately redirect scanning device to chat workspace!
    switchScreen('chat');
    if (el.chatTargetSession) {
      el.chatTargetSession.textContent = targetToken.toUpperCase();
    }
    if (el.activePeerName) {
      el.activePeerName.textContent = `Connecting to ${targetToken.toUpperCase()}...`;
    }
    if (el.chatMessagesStream) {
      el.chatMessagesStream.innerHTML = `
        <div class="system-chat-bubble info">
          <i data-lucide="info" class="w-4 h-4"></i>
          <div>QR detected. Establishing encrypted peer-to-peer connection...</div>
          <span class="bubble-time">${getCurrentTime()}</span>
        </div>
      `;
    }

    showToast(`QR Code Detected: ${targetToken.toUpperCase()}`, 'success');
    connectToRemotePeer(targetToken);
  }

  function stopQRScannerCamera() {
    if (state.scannerAnimId) {
      cancelAnimationFrame(state.scannerAnimId);
      state.scannerAnimId = null;
    }
    if (state.scannerStream) {
      state.scannerStream.getTracks().forEach(t => t.stop());
      state.scannerStream = null;
    }
    if (el.scannerVideo) {
      el.scannerVideo.classList.add('hidden');
    }
    if (el.scannerStatusText) {
      el.scannerStatusText.textContent = 'Camera Standby';
    }
  }

  function flipScannerCamera() {
    AudioFX.click();
    state.scannerFacingMode = state.scannerFacingMode === 'user' ? 'environment' : 'user';
    stopQRScannerCamera();
    startQRScannerCamera();
  }

  async function connectToRemotePeer(targetToken) {
    const cleanId = targetToken.toLowerCase().trim();
    state.sessionId = cleanId;
    state.role = 'peer';

    stopQRScannerCamera();
    switchScreen('chat');

    if (el.activePeerName) {
      el.activePeerName.textContent = `Connecting to ${cleanId.toUpperCase()}...`;
    }

    // 1. Initialize Relay session and start active polling
    await initRelaySession(cleanId);
    startRelayPolling();

    // 2. Transmit immediate handshake via dual transport
    sendPacket({
      type: 'HANDSHAKE',
      device: LOCAL_DEVICE_NAME
    });

    // 3. Initiate WebRTC Direct P2P tunnel
    if (typeof Peer === 'undefined') {
      setTimeout(() => connectToRemotePeer(cleanId), 600);
      return;
    }

    if (state.peer) {
      try { state.peer.destroy(); } catch (e) {}
      state.peer = null;
    }

    try {
      state.peer = new Peer(null, PEER_CONFIG);

      state.peer.on('open', () => {
        const conn = state.peer.connect(cleanId, {
          reliable: true,
          metadata: { device: LOCAL_DEVICE_NAME }
        });
        setupDataConnection(conn);
      });

      state.peer.on('error', (err) => {
        console.warn('WebRTC direct connection fallback active:', err.type || err.message);
      });
    } catch (e) {
      console.warn('Peer error:', e);
    }
  }

  // ==========================================
  // WEBRTC DATA CONNECTION HANDLER
  // ==========================================
  function setupDataConnection(conn) {
    state.conn = conn;

    function markReady() {
      if (state.isConnected) return;
      state.isConnected = true;

      const remoteDeviceName = conn.metadata?.device || (state.isHost ? 'Scanner Device' : 'Host Device');
      onPairingSuccess(remoteDeviceName);

      // Send initial handshake
      try {
        sendPacket({
          type: 'HANDSHAKE',
          device: LOCAL_DEVICE_NAME
        });

        if (state.isHost) {
          sendPacket({
            type: 'DOC_SYNC',
            content: state.documentContent,
            title: el.docTitleInput ? el.docTitleInput.value : 'shared_ephemeral_notes.md'
          });
        }
      } catch (e) {}
    }

    if (conn.open) {
      markReady();
    } else {
      conn.on('open', markReady);
    }

    conn.on('data', (packet) => {
      handleIncomingPacket(packet);
    });

    conn.on('close', () => {
      handlePeerDisconnect('Peer left the session');
    });

    conn.on('error', (err) => {
      console.warn('DataChannel warning:', err);
    });
  }

  function onPairingSuccess(peerName) {
    if (state.isConnected && state.peerDeviceName === peerName) return;
    AudioFX.chime();
    state.isConnected = true;
    state.peerDeviceName = peerName || 'Remote Peer';

    stopQRScannerCamera();
    switchScreen('chat');

    if (el.activePeerName) el.activePeerName.textContent = state.peerDeviceName;
    if (el.chatTargetSession && state.sessionId) el.chatTargetSession.textContent = state.sessionId.toUpperCase();

    // Render Clean Success System Notice matching reference UI
    const hasNotice = el.chatMessagesStream?.querySelector('.sys-connected');
    if (!hasNotice && el.chatMessagesStream) {
      const bubble = document.createElement('div');
      bubble.className = 'system-chat-bubble success sys-connected';
      bubble.innerHTML = `
        <i data-lucide="check-circle-2" class="w-4 h-4"></i>
        <div>Secure channel established. You can now send messages, files and images.</div>
        <span class="bubble-time">${getCurrentTime()}</span>
      `;
      el.chatMessagesStream.appendChild(bubble);
      refreshIcons();
    }

    showToast(`Connected with ${state.peerDeviceName}!`, 'success');
  }

  // ==========================================
  // INCOMING PACKET DISPATCHER
  // ==========================================
  function handleIncomingPacket(packet) {
    if (!packet || !packet.type) return;

    // Deduplicate packets received over both WebRTC & Relay
    if (packet.uid) {
      if (state.seenPacketIds.has(packet.uid)) return;
      state.seenPacketIds.add(packet.uid);
      if (state.seenPacketIds.size > 2000) {
        const first = state.seenPacketIds.values().next().value;
        state.seenPacketIds.delete(first);
      }
    }

    // Any valid packet confirms active connection
    if (!state.isConnected) {
      const device = packet.device || (state.isHost ? 'Scanner Device' : 'Host Device');
      onPairingSuccess(device);
    }

    switch (packet.type) {
      case 'HANDSHAKE':
        if (packet.device) {
          state.peerDeviceName = packet.device;
          if (el.activePeerName) el.activePeerName.textContent = packet.device;
        }
        // If host was still on Show QR screen, immediately jump to chat
        if (el.viewShowQR?.classList.contains('active')) {
          switchScreen('chat');
        }
        break;

      case 'CHAT':
        AudioFX.messagePop();
        renderMessageBubble({
          sender: 'peer',
          senderName: packet.senderName || state.peerDeviceName,
          text: packet.text,
          time: packet.time || getCurrentTime()
        });
        break;

      case 'DOC_SYNC':
        if (el.liveDocumentEditor && packet.content !== undefined) {
          if (el.liveDocumentEditor.value !== packet.content) {
            const start = el.liveDocumentEditor.selectionStart;
            const end = el.liveDocumentEditor.selectionEnd;
            el.liveDocumentEditor.value = packet.content;
            state.documentContent = packet.content;
            el.liveDocumentEditor.setSelectionRange(start, end);
            updateDocStats();
          }
          if (packet.title && el.docTitleInput) {
            el.docTitleInput.value = packet.title;
          }
        }
        break;

      case 'DOC_CLEAR':
        if (el.liveDocumentEditor) {
          el.liveDocumentEditor.value = '';
          state.documentContent = '';
          updateDocStats();
          showToast('Peer cleared the collaborative document');
        }
        break;

      case 'FILE_START':
        state.incomingTransfers[packet.id] = {
          name: packet.name,
          size: packet.size,
          mime: packet.mime || 'application/octet-stream',
          totalChunks: packet.totalChunks,
          chunks: new Array(packet.totalChunks),
          received: 0,
          card: renderReceivingFileCard(packet)
        };
        break;

      case 'FILE_CHUNK':
        const fileTransfer = state.incomingTransfers[packet.id];
        if (fileTransfer) {
          fileTransfer.chunks[packet.chunkIndex] = packet.data;
          fileTransfer.received++;
          updateReceivingCardProgress(fileTransfer, packet.id);
        }
        break;

      case 'FILE_COMPLETE':
        finalizeReceivedFile(packet.id);
        break;

      case 'TERMINATE':
        handlePeerTerminated();
        break;
    }
  }

  // ==========================================
  // REAL CHAT MESSAGING
  // ==========================================
  function sendChatMessage() {
    const text = el.chatInput?.value.trim();
    if (!text) return;

    if (!state.sessionId) {
      showToast('Please pair devices first', 'danger');
      return;
    }

    AudioFX.click();
    const timeStr = getCurrentTime();

    // Broadcast through unified dual-engine
    sendPacket({
      type: 'CHAT',
      text: text,
      time: timeStr,
      senderName: LOCAL_DEVICE_NAME
    });

    // Render locally
    renderMessageBubble({
      sender: 'self',
      senderName: 'You',
      text: text,
      time: timeStr
    });

    el.chatInput.value = '';
    el.chatInput.style.height = 'auto';
  }

  function renderMessageBubble(msg) {
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${msg.sender}`;
    bubble.innerHTML = `
      <div class="bubble-meta">
        <span class="bubble-sender">${escapeHtml(msg.senderName)}</span>
        <span class="bubble-time">${msg.time}</span>
      </div>
      <div class="bubble-content">
        ${escapeHtml(msg.text)}
      </div>
    `;

    el.chatMessagesStream?.appendChild(bubble);
    el.chatMessagesStream?.scrollTo({
      top: el.chatMessagesStream.scrollHeight,
      behavior: 'smooth'
    });
    refreshIcons();
  }

  // ==========================================
  // REAL FILE TRANSFER & LOCAL DOWNLOAD
  // ==========================================
  function sendFileToPeer(file) {
    if (!state.sessionId) {
      showToast('No active session. Please pair devices first.', 'danger');
      return;
    }

    AudioFX.click();
    const fileId = 'f_' + Math.random().toString(36).substring(2, 9);
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // Render outgoing bubble in chat
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble self';
    bubble.innerHTML = `
      <div class="bubble-meta">
        <span class="bubble-sender">You</span>
        <span class="bubble-time">${getCurrentTime()}</span>
      </div>
      <div class="bubble-content">
        <div class="chat-file-card">
          <div class="file-info-col">
            <span class="file-title-text">${escapeHtml(file.name)}</span>
            <span class="file-size-text" id="sendProg_${fileId}">Streaming (${formatFileSize(file.size)})...</span>
          </div>
          <i data-lucide="upload-cloud" class="w-4 h-4 text-cyan"></i>
        </div>
      </div>
    `;
    el.chatMessagesStream?.appendChild(bubble);
    el.chatMessagesStream?.scrollTo({ top: el.chatMessagesStream.scrollHeight, behavior: 'smooth' });
    refreshIcons();

    // 1. Notify peer of file start
    sendPacket({
      type: 'FILE_START',
      id: fileId,
      name: file.name,
      size: file.size,
      mime: file.type,
      totalChunks: totalChunks
    });

    // 2. Read and stream chunks as DataURL (safe for both WebRTC DataChannel & HTTP JSON relay)
    let currentChunk = 0;

    function readAndSendChunk() {
      const start = currentChunk * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const slice = file.slice(start, end);
      const reader = new FileReader();

      reader.onload = (e) => {
        sendPacket({
          type: 'FILE_CHUNK',
          id: fileId,
          chunkIndex: currentChunk,
          data: e.target.result // Base64 dataURL
        });

        currentChunk++;
        const progress = Math.round((currentChunk / totalChunks) * 100);
        const progEl = document.getElementById(`sendProg_${fileId}`);
        if (progEl) progEl.textContent = `Sending ${progress}% (${formatFileSize(file.size)})`;

        if (currentChunk < totalChunks) {
          setTimeout(readAndSendChunk, 8);
        } else {
          sendPacket({ type: 'FILE_COMPLETE', id: fileId });
          if (progEl) progEl.textContent = `Sent • ${formatFileSize(file.size)}`;
          showToast(`Sent ${file.name}!`, 'success');
        }
      };

      reader.readAsDataURL(slice);
    }

    readAndSendChunk();
  }

  function renderReceivingFileCard(packet) {
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble peer';
    bubble.id = `recv_${packet.id}`;
    bubble.innerHTML = `
      <div class="bubble-meta">
        <span class="bubble-sender">${escapeHtml(state.peerDeviceName)}</span>
        <span class="bubble-time">${getCurrentTime()}</span>
      </div>
      <div class="bubble-content">
        <div class="chat-file-card">
          <div class="file-info-col">
            <span class="file-title-text">${escapeHtml(packet.name)}</span>
            <span class="file-size-text" id="recvStatus_${packet.id}">Receiving 0%...</span>
          </div>
          <i data-lucide="download-cloud" class="w-4 h-4 text-emerald"></i>
        </div>
      </div>
    `;
    el.chatMessagesStream?.appendChild(bubble);
    el.chatMessagesStream?.scrollTo({ top: el.chatMessagesStream.scrollHeight, behavior: 'smooth' });
    refreshIcons();
    return bubble;
  }

  function updateReceivingCardProgress(fileTransfer, fileId) {
    const progress = Math.round((fileTransfer.received / fileTransfer.totalChunks) * 100);
    const statusEl = document.getElementById(`recvStatus_${fileId}`);
    if (statusEl) statusEl.textContent = `Receiving ${progress}% (${formatFileSize(fileTransfer.size)})`;
  }

  function finalizeReceivedFile(fileId) {
    const fileTransfer = state.incomingTransfers[fileId];
    if (!fileTransfer) return;

    AudioFX.messagePop();

    // Reconstruct chunks into binary Blob parts
    const blobParts = [];
    for (let i = 0; i < fileTransfer.totalChunks; i++) {
      const chunkData = fileTransfer.chunks[i];
      if (chunkData instanceof ArrayBuffer) {
        blobParts.push(chunkData);
      } else if (typeof chunkData === 'string') {
        const b64 = chunkData.split(',')[1] || chunkData;
        const binStr = atob(b64);
        const len = binStr.length;
        const bytes = new Uint8Array(len);
        for (let j = 0; j < len; j++) {
          bytes[j] = binStr.charCodeAt(j);
        }
        blobParts.push(bytes);
      }
    }

    const blob = new Blob(blobParts, { type: fileTransfer.mime });
    const blobUrl = URL.createObjectURL(blob);
    state.sessionFiles.push({ id: fileId, name: fileTransfer.name, blob, url: blobUrl });

    const bubble = document.getElementById(`recv_${fileId}`);
    if (bubble) {
      let previewHtml = '';
      if (fileTransfer.mime && fileTransfer.mime.startsWith('image/')) {
        previewHtml = `<img src="${blobUrl}" class="chat-snap-thumb" alt="${escapeHtml(fileTransfer.name)}">`;
      }

      bubble.innerHTML = `
        <div class="bubble-meta">
          <span class="bubble-sender">${escapeHtml(state.peerDeviceName)}</span>
          <span class="bubble-time">${getCurrentTime()}</span>
        </div>
        <div class="bubble-content">
          <div style="font-size: 0.82rem; margin-bottom: 0.25rem;">📎 Received Document:</div>
          ${previewHtml}
          <div class="chat-file-card">
            <div class="file-info-col">
              <span class="file-title-text">${escapeHtml(fileTransfer.name)}</span>
              <span class="file-size-text">${formatFileSize(fileTransfer.size)} • Verified</span>
            </div>
            <a href="${blobUrl}" download="${escapeHtml(fileTransfer.name)}" class="btn-file-download">
              <i data-lucide="download" class="w-3.5 h-3.5"></i>
              <span>Download</span>
            </a>
          </div>
        </div>
      `;
      refreshIcons();
    }

    showToast(`Received ${fileTransfer.name}!`, 'success');
    delete state.incomingTransfers[fileId];
  }

  // ==========================================
  // REAL CAMERA SNAPSHOT CAPTURE
  // ==========================================
  async function openCameraModal() {
    AudioFX.click();
    el.modalCamera?.classList.remove('hidden');
    el.modalSnapPreviewOverlay?.classList.add('hidden');
    refreshIcons();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    try {
      state.modalCamStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: state.modalCamFacingMode },
        audio: false
      });
      if (el.modalCameraVideo) {
        el.modalCameraVideo.srcObject = state.modalCamStream;
        el.modalCameraVideo.play().catch(() => {});
      }
    } catch (e) {
      console.warn('Camera modal stream unavailable:', e);
    }
  }

  function closeCameraModal() {
    if (state.modalCamStream) {
      state.modalCamStream.getTracks().forEach(t => t.stop());
      state.modalCamStream = null;
    }
    state.capturedSnapBlob = null;
    el.modalCamera?.classList.add('hidden');
  }

  function flipModalCamera() {
    AudioFX.click();
    state.modalCamFacingMode = state.modalCamFacingMode === 'user' ? 'environment' : 'user';
    closeCameraModal();
    openCameraModal();
  }

  function triggerModalShutter() {
    AudioFX.shutter();

    const video = el.modalCameraVideo;
    const canvas = el.modalCameraCanvas;
    if (!canvas) return;

    canvas.width = video?.videoWidth || 640;
    canvas.height = video?.videoHeight || 480;
    const ctx = canvas.getContext('2d');

    if (video && video.videoWidth) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#38bdf8';
      ctx.font = '20px Plus Jakarta Sans';
      ctx.textAlign = 'center';
      ctx.fillText('📷 Instant Camera Photo', canvas.width / 2, canvas.height / 2);
    }

    canvas.toBlob((blob) => {
      state.capturedSnapBlob = blob;
      const previewUrl = URL.createObjectURL(blob);
      if (el.modalSnapPreviewImg) el.modalSnapPreviewImg.src = previewUrl;
      el.modalSnapPreviewOverlay?.classList.remove('hidden');
    }, 'image/jpeg', 0.85);
  }

  function retakeModalSnap() {
    AudioFX.click();
    state.capturedSnapBlob = null;
    el.modalSnapPreviewOverlay?.classList.add('hidden');
  }

  function sendModalSnapToPeer() {
    if (!state.capturedSnapBlob) return;
    AudioFX.click();

    const fileName = `snap_${Date.now().toString().slice(-6)}.jpg`;
    const photoFile = new File([state.capturedSnapBlob], fileName, { type: 'image/jpeg' });
    closeCameraModal();

    sendFileToPeer(photoFile);
  }

  // ==========================================
  // REAL COLLABORATIVE DOCUMENT SCRATCHPAD
  // ==========================================
  function openNotesModal() {
    AudioFX.click();
    el.modalNotes?.classList.remove('hidden');
    if (el.liveDocumentEditor) {
      el.liveDocumentEditor.value = state.documentContent;
    }
    updateDocStats();
    refreshIcons();
  }

  function closeNotesModal() {
    el.modalNotes?.classList.add('hidden');
  }

  function handleDocInput() {
    state.documentContent = el.liveDocumentEditor.value;
    updateDocStats();

    clearTimeout(state.docSyncTimer);
    state.docSyncTimer = setTimeout(() => {
      sendPacket({
        type: 'DOC_SYNC',
        content: state.documentContent,
        title: el.docTitleInput ? el.docTitleInput.value : 'shared_ephemeral_notes.md'
      });
    }, 45);
  }

  function updateDocStats() {
    if (!el.liveDocumentEditor) return;
    const len = el.liveDocumentEditor.value.length;
    if (el.docCharCount) el.docCharCount.textContent = `${len} characters`;
  }

  function applyFormatting(formatType) {
    const editor = el.liveDocumentEditor;
    if (!editor) return;

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = editor.value.substring(start, end);

    let rep = '';
    switch (formatType) {
      case 'bold': rep = `**${selected || 'bold text'}**`; break;
      case 'italic': rep = `*${selected || 'italic text'}*`; break;
      case 'heading': rep = `\n## ${selected || 'Heading'}\n`; break;
      case 'checklist': rep = `\n- [ ] ${selected || 'Task'}\n`; break;
      case 'code': rep = `\n\`\`\`\n${selected || '// code'}\n\`\`\`\n`; break;
    }

    editor.setRangeText(rep, start, end, 'end');
    editor.focus();
    handleDocInput();
  }

  function downloadDocument() {
    AudioFX.click();
    const content = el.liveDocumentEditor?.value || '';
    const title = el.docTitleInput?.value.trim() || 'shared_notes.md';
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = title;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Downloaded ${title}!`, 'success');
  }

  function clearDocument() {
    AudioFX.click();
    if (el.liveDocumentEditor) {
      el.liveDocumentEditor.value = '';
      state.documentContent = '';
      updateDocStats();
      sendPacket({ type: 'DOC_CLEAR' });
      showToast('Document cleared');
    }
  }

  // ==========================================
  // REAL CHAT TERMINATION (MUTUAL KILL SWITCH)
  // ==========================================
  function openTerminateModal() {
    AudioFX.click();
    el.terminateModal?.classList.remove('hidden');
    resetSlideThumb();
    refreshIcons();
  }

  function closeTerminateModal() {
    el.terminateModal?.classList.add('hidden');
  }

  async function executeSessionTermination(isRemote = false) {
    AudioFX.purge();
    closeTerminateModal();
    closeCameraModal();
    closeNotesModal();

    const targetSid = state.sessionId;

    // 1. If local user initiated, broadcast terminate immediately across both channels
    if (!isRemote) {
      // Notify Relay server to terminate for both devices
      if (targetSid && state.relayUrl) {
        try {
          fetch(`${state.relayUrl}/api/session/terminate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: targetSid })
          }).catch(() => {});
        } catch (e) {}
      }

      // Notify WebRTC peer
      if (state.conn && state.conn.open) {
        try {
          state.conn.send({ type: 'TERMINATE', uid: 'term_' + Date.now() });
        } catch (e) {}
      }
    }

    // Stop polling
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }

    // Stop camera streams
    stopQRScannerCamera();
    if (state.modalCamStream) {
      state.modalCamStream.getTracks().forEach(t => t.stop());
      state.modalCamStream = null;
    }

    // Give outbound socket buffer 250ms to flush before closing
    setTimeout(() => {
      if (state.conn) {
        try { state.conn.close(); } catch (e) {}
        state.conn = null;
      }
      if (state.peer) {
        try { state.peer.destroy(); } catch (e) {}
        state.peer = null;
      }
    }, 250);

    // Show purge animation
    el.purgeScreen?.classList.remove('hidden');

    setTimeout(() => {
      // Wipe memory completely
      state.sessionFiles.forEach(f => {
        if (f.url) URL.revokeObjectURL(f.url);
      });
      state.sessionFiles = [];
      state.incomingTransfers = {};
      state.seenPacketIds.clear();
      state.isConnected = false;
      state.sessionId = null;
      state.documentContent = '';

      if (el.chatMessagesStream) el.chatMessagesStream.innerHTML = '';
      if (el.liveDocumentEditor) el.liveDocumentEditor.value = '';
      if (el.chatInput) el.chatInput.value = '';

      // Clear hash from URL
      if (window.location.hash) {
        history.replaceState(null, document.title, window.location.pathname + window.location.search);
      }

      // Return to Screen 1: Choice
      switchScreen('choice');
      el.purgeScreen?.classList.add('hidden');

      showToast(isRemote ? 'Session Terminated by Remote Device. Memory Wiped.' : 'Session Shredded. Zero Traces Remaining.', 'danger');
      refreshIcons();
    }, 1300);
  }

  function handlePeerTerminated() {
    executeSessionTermination(true);
  }

  function handlePeerDisconnect(reason) {
    if (state.sessionId && (el.viewChat?.classList.contains('active') || state.isConnected)) {
      showToast(reason || 'Peer disconnected. Terminating session...', 'danger');
      executeSessionTermination(true);
    }
  }

  // ==========================================
  // SLIDE TO SHRED GESTURE
  // ==========================================
  function setupSlideToBurn() {
    let isDragging = false;
    let startX = 0;
    const track = el.slideTrack;
    const thumb = el.slideThumb;
    if (!track || !thumb) return;

    function onStart(e) {
      isDragging = true;
      startX = (e.touches ? e.touches[0].clientX : e.clientX) - thumb.offsetLeft;
    }

    function onMove(e) {
      if (!isDragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const maxLeft = track.clientWidth - thumb.clientWidth - 8;
      let newLeft = clientX - startX;
      if (newLeft < 4) newLeft = 4;
      if (newLeft > maxLeft) newLeft = maxLeft;

      thumb.style.transform = `translateX(${newLeft - 4}px)`;

      if (newLeft >= maxLeft * 0.88) {
        isDragging = false;
        executeSessionTermination(false);
      }
    }

    function onEnd() {
      if (!isDragging) return;
      isDragging = false;
      resetSlideThumb();
    }

    thumb.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    thumb.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
  }

  function resetSlideThumb() {
    if (el.slideThumb) {
      el.slideThumb.style.transform = 'translateX(0px)';
    }
  }

  // ==========================================
  // EVENT BINDINGS
  // ==========================================
  function bindEvents() {
    // Sound FX toggle
    el.btnSoundToggle?.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      el.soundIcon?.setAttribute('data-lucide', state.soundEnabled ? 'volume-2' : 'volume-x');
      refreshIcons();
      showToast(state.soundEnabled ? 'Sound FX Enabled' : 'Sound FX Muted');
      AudioFX.click();
    });

    // Screen 1: Choice buttons
    el.btnSelectShowQR?.addEventListener('click', handleSelectShowQR);
    el.btnSelectScanQR?.addEventListener('click', handleSelectScanQR);

    // Back buttons
    el.btnBackFromShowQR?.addEventListener('click', () => {
      AudioFX.click();
      if (state.pollTimer) clearInterval(state.pollTimer);
      if (state.peer) state.peer.destroy();
      switchScreen('choice');
    });

    el.btnBackFromScanQR?.addEventListener('click', () => {
      AudioFX.click();
      stopQRScannerCamera();
      if (state.pollTimer) clearInterval(state.pollTimer);
      if (state.peer) state.peer.destroy();
      switchScreen('choice');
    });

    // Show QR actions
    el.btnCopySessionLink?.addEventListener('click', () => {
      AudioFX.click();
      const code = state.sessionId || '';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => {
          showToast(`PIN Code ${code.toUpperCase()} Copied!`);
        });
      }
    });

    // Scanner actions
    el.btnFlipScannerCam?.addEventListener('click', flipScannerCamera);
    el.btnConnectByPin?.addEventListener('click', () => {
      let pin = el.inputManualPin?.value.trim().toLowerCase();
      if (!pin) {
        showToast('Please enter PIN code');
        return;
      }
      if (!pin.startsWith('ephem-')) pin = `ephem-${pin}`;
      connectToRemotePeer(pin);
    });

    // Chat actions
    el.chatForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      sendChatMessage();
    });

    el.chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });

    el.chatFileInput?.addEventListener('change', (e) => {
      if (e.target.files.length) {
        Array.from(e.target.files).forEach(file => sendFileToPeer(file));
        e.target.value = '';
      }
    });

    // Bridge Quick Nav Items
    document.getElementById('btnNavChat')?.addEventListener('click', () => {
      el.chatInput?.focus();
    });
    document.getElementById('btnNavCam')?.addEventListener('click', () => {
      openCameraModal();
    });

    // Camera Modal
    el.btnOpenSnapModal?.addEventListener('click', openCameraModal);
    el.btnCloseCameraModal?.addEventListener('click', closeCameraModal);
    el.btnFlipModalCamera?.addEventListener('click', flipModalCamera);
    el.btnTriggerModalShutter?.addEventListener('click', triggerModalShutter);
    el.btnRetakeModalSnap?.addEventListener('click', retakeModalSnap);
    el.btnSendModalSnap?.addEventListener('click', sendModalSnapToPeer);

    // Native Camera File Input for Android
    el.nativeCameraFileInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const photo = e.target.files[0];
        closeCameraModal();
        sendFileToPeer(photo);
        e.target.value = '';
      }
    });

    // Notes Modal
    el.btnOpenNotesModal?.addEventListener('click', openNotesModal);
    el.btnCloseNotesModal?.addEventListener('click', closeNotesModal);
    el.liveDocumentEditor?.addEventListener('input', handleDocInput);
    el.btnDownloadDoc?.addEventListener('click', downloadDocument);
    el.btnClearDoc?.addEventListener('click', clearDocument);
    el.fmtButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        AudioFX.click();
        const fmt = btn.getAttribute('data-fmt');
        applyFormatting(fmt);
      });
    });

    // Termination
    el.btnTerminateSession?.addEventListener('click', openTerminateModal);
    el.btnCancelTerminate?.addEventListener('click', closeTerminateModal);
    el.btnConfirmTerminateFast?.addEventListener('click', () => executeSessionTermination(false));
    setupSlideToBurn();
  }

  // ==========================================
  // UTILITIES
  // ==========================================
  function showToast(message, type = 'info') {
    if (!el.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';

    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'danger') icon = 'alert-triangle';

    toast.innerHTML = `
      <i data-lucide="${icon}" class="w-4 h-4 ${type === 'danger' ? 'text-red' : (type === 'success' ? 'text-emerald' : 'text-cyan')}"></i>
      <span>${escapeHtml(message)}</span>
    `;

    el.toastContainer.appendChild(toast);
    refreshIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3000);
  }

  function getCurrentTime() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('load', refreshIcons);

})();
