// Dumb room relay + static file server. Holds NO game logic.
// In the APK this role is played by the host phone; the game engine stays in the host's page.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const WEB = path.join(__dirname, '..', 'web');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(WEB, path.normalize(p));
  if (!file.startsWith(WEB)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });
const crypto = require('crypto');
const rooms = new Map(); // code -> { host: ws, peers: Map<id, ws>, tokens: Map<id, token>, next: number }

function code() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}
const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

wss.on('connection', (ws) => {
  ws.room = null; ws.pid = null; ws.isHost = false;
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'host' && !ws.room) {
      const c = code();
      rooms.set(c, { host: ws, peers: new Map(), tokens: new Map(), next: 1 });
      ws.room = c; ws.isHost = true;
      send(ws, { t: 'hosting', code: c });
    } else if (m.t === 'join' && !ws.room) {
      const r = rooms.get(String(m.code || '').toUpperCase());
      if (!r) return send(ws, { t: 'error', msg: 'No game with that code.' });
      let id, token;
      if (m.rejoin && r.tokens.get(m.rejoin.id) && r.tokens.get(m.rejoin.id) === m.rejoin.token) {
        id = m.rejoin.id; token = m.rejoin.token;            // same seat, new socket
        const old = r.peers.get(id); if (old && old !== ws) { old.pid = null; old.room = null; old.close(); }
      } else { id = 'p' + r.next++; token = crypto.randomBytes(8).toString('hex'); r.tokens.set(id, token); }
      r.peers.set(id, ws); ws.room = String(m.code).toUpperCase(); ws.pid = id;
      send(ws, { t: 'joined', id, token });
      send(r.host, { t: 'peer-join', id, name: String(m.name || '').slice(0, 14) });
    } else if (m.t === 'send' && ws.isHost) {          // host -> peers
      const r = rooms.get(ws.room); if (!r) return;
      if (m.to === 'all') r.peers.forEach((p) => send(p, { t: 'msg', msg: m.msg }));
      else send(r.peers.get(m.to), { t: 'msg', msg: m.msg });
    } else if (m.t === 'send' && ws.pid) {             // peer -> host
      const r = rooms.get(ws.room); if (r) send(r.host, { t: 'peer-msg', id: ws.pid, msg: m.msg });
    }
  });
  ws.on('close', () => {
    const r = rooms.get(ws.room); if (!r) return;
    if (ws.isHost) { r.peers.forEach((p) => { send(p, { t: 'host-left' }); p.close(); }); rooms.delete(ws.room); }
    else if (ws.pid && r.peers.get(ws.pid) === ws) { r.peers.delete(ws.pid); send(r.host, { t: 'peer-leave', id: ws.pid }); }
  });
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Pass the Ace relay on port ${PORT}`);
    Object.values(os.networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal)
      .forEach((i) => console.log(`  open on phones/tabs: http://${i.address}:${PORT}`));
    console.log(`  local: http://localhost:${PORT}`);
  });
}
module.exports = { server, wss };
