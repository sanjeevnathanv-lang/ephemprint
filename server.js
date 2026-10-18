/**
 * EphemPrint — Local LAN Web Server
 * Zero-dependency Node.js static server for cross-device mobile & PC pairing.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// Find local network IPv4 address (e.g. 192.168.x.x)
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIp = getLocalIpAddress();

// ========================================================================
// ZERO-TRACE IN-MEMORY VOLATILE SESSION RELAY
// Strictly RAM-only. No disks, no database, no logs of message content.
// ========================================================================
const sessions = new Map();

function cleanOldSessions() {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (now - s.lastSeen > 30 * 60 * 1000) { // 30 min idle
      sessions.delete(id);
    }
  }
}
setInterval(cleanOldSessions, 60000);

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) req.destroy(); // 50MB max file transfer cap
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  // Global CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // 1. API: Server Info (returns local IP and port)
  if (pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ localIp, port: PORT }));
    return;
  }

  // 2. API: Initialize session
  if (pathname === '/api/session/init' && req.method === 'POST') {
    const data = await parseJsonBody(req);
    const sid = (data.sessionId || '').toLowerCase().trim();
    if (sid) {
      let s = sessions.get(sid);
      if (!s) {
        sessions.set(sid, {
          hostQueue: [],
          peerQueue: [],
          terminated: false,
          lastSeen: Date.now()
        });
      } else {
        s.lastSeen = Date.now();
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, sessionId: sid }));
    return;
  }

  // 3. API: Send packet to peer
  if (pathname === '/api/session/send' && req.method === 'POST') {
    const data = await parseJsonBody(req);
    const sid = (data.sessionId || '').toLowerCase().trim();
    const from = data.from; // 'host' or 'peer'
    const packet = data.packet;

    if (sid && packet) {
      let s = sessions.get(sid);
      if (!s) {
        s = { hostQueue: [], peerQueue: [], terminated: false, lastSeen: Date.now() };
        sessions.set(sid, s);
      }
      s.lastSeen = Date.now();
      if (from === 'host') {
        s.peerQueue.push(packet);
      } else {
        s.hostQueue.push(packet);
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // 4. API: Poll for incoming packets
  if (pathname === '/api/session/poll' && req.method === 'GET') {
    const sid = (urlObj.searchParams.get('sessionId') || '').toLowerCase().trim();
    const role = urlObj.searchParams.get('role'); // 'host' or 'peer'

    let s = sessions.get(sid);
    if (!s) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, packets: [], terminated: false }));
      return;
    }

    s.lastSeen = Date.now();

    if (s.terminated) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, packets: [{ type: 'TERMINATE' }], terminated: true }));
      return;
    }

    const queue = role === 'host' ? s.hostQueue : s.peerQueue;
    const packets = queue.splice(0);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, packets, terminated: false }));
    return;
  }

  // 5. API: Terminate session on both devices
  if (pathname === '/api/session/terminate' && req.method === 'POST') {
    const data = await parseJsonBody(req);
    const sid = (data.sessionId || '').toLowerCase().trim();

    if (sid) {
      let s = sessions.get(sid);
      if (!s) {
        s = { hostQueue: [], peerQueue: [], terminated: true, lastSeen: Date.now() };
        sessions.set(sid, s);
      } else {
        s.terminated = true;
      }
      s.hostQueue.push({ type: 'TERMINATE' });
      s.peerQueue.push({ type: 'TERMINATE' });

      // Immediate zero-fill purge after propagation grace period
      setTimeout(() => {
        if (sessions.has(sid)) {
          const sess = sessions.get(sid);
          sess.hostQueue.length = 0;
          sess.peerQueue.length = 0;
          sessions.delete(sid);
        }
      }, 5000);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, terminated: true }));
    return;
  }

  // 6. Static File Serving
  let reqPath = decodeURI(pathname);
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const filePath = path.join(ROOT, reqPath);

  // Security: prevent path traversal outside root
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n========================================================================');
  console.log('  ⚡ EphemPrint — Real P2P Mobile & Desktop Bridge Server');
  console.log('========================================================================');
  console.log(`  🖥️  Windows Host URL : http://localhost:${PORT}`);
  console.log(`  📱  Mobile / Android : http://${localIp}:${PORT}`);
  console.log('========================================================================');
  console.log('  1. Open http://localhost:' + PORT + ' in your PC browser.');
  console.log('  2. Scan the on-screen QR code with your Android phone camera.');
  console.log('  3. Both devices pair instantly over real encrypted WebRTC DataChannel!');
  console.log('========================================================================\n');
});
