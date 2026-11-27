const assert = require('assert');
const WebSocket = require('ws');
const { server } = require('../server/relay.js');

server.listen(0, () => {
  const port = server.address().port, url = `ws://127.0.0.1:${port}/ws`;
  const conn = (onmsg) => { const w = new WebSocket(url); w.on('message', (d) => onmsg(JSON.parse(d), w)); return w; };
  const got = [];
  const h = conn((m, w) => {
    got.push(['host', m.t]);
    if (m.t === 'hosting') {
      const c = conn((cm, cw) => {
        got.push(['client', cm.t]);
        if (cm.t === 'joined') cw.send(JSON.stringify({ t: 'send', msg: { t: 'action', a: 'swap' } }));
        if (cm.t === 'msg') { assert.strictEqual(cm.msg.t, 'view'); console.log('relay tests passed'); process.exit(0); }
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
