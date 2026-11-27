// Transport to the relay. Swap this file (e.g. for Nearby Connections / a native
// hotspot server in the APK) without touching game logic.
(function (root) {
  function open(handlers) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } handlers.onmessage && handlers.onmessage(m); };
    ws.onopen = () => handlers.onopen && handlers.onopen();
    ws.onclose = () => handlers.onclose && handlers.onclose();
    ws.onerror = () => handlers.onerror && handlers.onerror();
    return { send: (o) => ws.readyState === 1 && ws.send(JSON.stringify(o)), close: () => ws.close() };
  }
  root.Net = { open };
})(window);
