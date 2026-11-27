const assert = require('assert');
const WebSocket = require('ws');
const { server } = require('../server/relay.js');

// RELAY_PORT=n tests an already-running relay (e.g. the Java one used in the APK) instead of the Node one.
const start = (cb) => (process.env.RELAY_PORT ? cb(+process.env.RELAY_PORT) : server.listen(0, () => cb(server.address().port)));
start((port) => {
  const url = `ws://127.0.0.1:${port}/ws`;
  const conn = (onmsg) => { const w = new WebSocket(url); w.on('message', (d) => onmsg(JSON.parse(d), w)); return w; };
  const got = [];
  const h = conn((m, w) => {
    got.push(['host', m.t]);
    if (m.t === 'hosting') {
      const c = conn((cm, cw) => {
        got.push(['client', cm.t]);
        if (cm.t === 'joined' && !cm.rejoined) { assert(cm.token); cw.send(JSON.stringify({ t: 'send', msg: { t: 'action', a: 'swap' } })); cw.creds = cm; }
        if (cm.t === 'msg') {
          assert.strictEqual(cm.msg.t, 'view');
          // rejoin with the token keeps the same seat id; a wrong token gets a fresh id
          const r = conn((rm) => { if (rm.t === 'joined') { assert.strictEqual(rm.id, cw.creds.id, 'rejoin keeps id'); console.log('relay tests passed'); process.exit(0); } });
          r.on('open', () => r.send(JSON.stringify({ t: 'join', code: m.code, name: 'X', rejoin: { id: cw.creds.id, token: cw.creds.token } })));
        }
      });
      c.on('open', () => c.send(JSON.stringify({ t: 'join', code: m.code, name: 'X' })));
      const bad = conn((bm) => assert.strictEqual(bm.t, 'error'));
      bad.on('open', () => bad.send(JSON.stringify({ t: 'join', code: 'ZZZZ', name: 'Y' })));
    }
    if (m.t === 'peer-msg') { assert.strictEqual(m.msg.a, 'swap'); w.send(JSON.stringify({ t: 'send', to: m.id, msg: { t: 'view' } })); }
  });
  h.on('open', () => h.send(JSON.stringify({ t: 'host' })));
  setTimeout(() => { console.error('timeout', got); process.exit(1); }, 4000);
});
