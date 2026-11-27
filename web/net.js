// Transport to the relay. In a browser the relay is the Node server (same origin).
// In the Android APK the host phone runs the relay natively (Capacitor "Relay" plugin)
// and other devices reach it over the hotspot at http://<phone-ip>:<port>.
(function (root) {
  const cap = root.Capacitor;
  const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const Relay = isNative && cap.registerPlugin ? cap.registerPlugin('Relay') : null;
  const Net = { isNative, lanAddrs: [], port: location.port || 3000 };

  const withPort = (a) => (/:\d+$/.test(a) ? a : a + ':3000');

  // opts: { host: bool, addr: 'ip[:port]' }  (addr needed when joining from the APK)
  Net.open = function (handlers, opts = {}) {
    let ws = null, closed = false;
    const connect = (url) => {
      ws = new WebSocket(url);
      ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } handlers.onmessage && handlers.onmessage(m); };
      ws.onopen = () => handlers.onopen && handlers.onopen();
      ws.onclose = () => { if (!closed) handlers.onclose && handlers.onclose(); };
      ws.onerror = () => handlers.onerror && handlers.onerror();
    };
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    if (opts.host && Relay) {
      Relay.start().then((r) => { Net.lanAddrs = r.addresses || []; Net.port = r.port; connect(`ws://127.0.0.1:${r.port}/ws`); })
        .catch(() => handlers.onerror && handlers.onerror());
    } else if (opts.addr) connect(`ws://${withPort(opts.addr)}/ws`);
    else connect(`${proto}://${location.host}/ws`);
    return {
      send: (o) => ws && ws.readyState === 1 && ws.send(JSON.stringify(o)),
      close: () => { closed = true; if (ws) ws.close(); if (opts.host && Relay) Relay.stop().catch(() => {}); },
    };
  };

  // URL other devices can open (and the QR encodes).
  Net.joinUrl = function (code) {
    if (isNative) return Net.lanAddrs.length ? `http://${Net.lanAddrs[0]}:${Net.port}/?code=${code}` : '';
    return `${location.origin}/?code=${code}`;
  };
  Net.hostLabel = () => (isNative ? (Net.lanAddrs[0] ? `${Net.lanAddrs[0]}:${Net.port}` : '(no network — turn on your hotspot)') : location.host);
  root.Net = Net;
})(window);
