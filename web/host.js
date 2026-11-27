// Host controller: lobby, authoritative game state, bots, broadcasting views.
// The host device is also a player (id 'host').
(function (root) {
  function Host(net, myName, onView) {
    const H = this;
    H.net = net; H.onView = onView;
    H.maxSeats = 4; H.fillBots = true;
    H.players = [{ id: 'host', name: myName, isBot: false, connected: true }];
    H.game = null; H.timer = null;
  }
  const P = Host.prototype;

  P.lobbyView = function (forId) {
    return { phase: 'lobby', meId: forId, maxSeats: this.maxSeats, fillBots: this.fillBots, code: this.code,
      seats: this.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, connected: p.connected })) };
  };
  P.push = function () {
    const H = this;
    const view = (id) => (H.game ? Engine.viewFor(H.game, id) : H.lobbyView(id));
    if (H.game) H.game.players.forEach((p) => { const c = H.players.find((q) => q.id === p.id); p.connected = c ? c.connected : true; });
    const decorate = (v) => { if (H.game) v.seats.forEach((s) => { const c = H.players.find((q) => q.id === s.id); s.connected = !c || c.connected; }); return v; };
    H.onView(decorate(view('host')));
    H.players.forEach((p) => { if (p.id !== 'host' && !p.isBot) H.net.send({ t: 'send', to: p.id, msg: { t: 'view', view: decorate(view(p.id)) } }); });
    H.schedule();
  };
  P.setMaxSeats = function (n) { if (this.game) return; this.maxSeats = n; this.push(); };
  P.setFillBots = function (b) { if (this.game) return; this.fillBots = b; this.push(); };
  P.addBot = function () {
    if (this.game || this.players.length >= this.maxSeats) return;
    const n = this.players.filter((p) => p.isBot).length + 1;
    this.players.push({ id: 'bot' + n + '_' + Date.now() % 1000, name: 'Bot ' + n, isBot: true, connected: true }); this.push();
  };
  P.peerJoin = function (id, name) {
    const ex = this.players.find((p) => p.id === id);
    if (ex) { ex.connected = true; if (name && !this.game) ex.name = name; this.push(); return; } // rejoin
    if (this.game || this.players.length >= this.maxSeats) { this.net.send({ t: 'send', to: id, msg: { t: 'full' } }); return; }
    this.players.push({ id, name: name || 'Player', isBot: false, connected: true }); this.push();
  };
  P.peerLeave = function (id) {
    if (!this.game) this.players = this.players.filter((p) => p.id !== id);
    else { const p = this.players.find((q) => q.id === id); if (p) p.connected = false; }
    this.push();
  };
  P.peerMsg = function (id, msg) { if (msg.t === 'action') this.action(id, msg.a); };

  P.start = function () {
    const H = this;
    if (H.game) return;
    let bots = H.players.filter((p) => p.isBot).length;
    while (H.fillBots && H.players.length < H.maxSeats) { bots++; H.players.push({ id: 'bot' + bots + '_' + H.players.length, name: 'Bot ' + bots, isBot: true, connected: true }); }
    if (H.players.length < 2) return false;
    H.game = Engine.create(H.players); H.push(); return true;
  };
  P.action = function (id, a) {
    const g = this.game; if (!g) return;
    if (Engine.act(g, id, a)) { clearTimeout(this.timer); this.timer = null; this.push(); }
  };
  P.playAgain = function () { clearTimeout(this.timer); this.timer = null; this.game = null; this.push(); };

  // Drives bots, disconnected seats, and reveal->next round.
  P.schedule = function () {
    const H = this, g = H.game;
    if (!g || H.timer) return;
    if (g.phase === 'reveal') H.timer = setTimeout(() => { H.timer = null; Engine.advance(g); H.push(); }, 4500);
    else if (g.phase === 'play') {
      const a = g.players[g.turn]; const peer = H.players.find((p) => p.id === a.id);
      if (a.isBot || (peer && !peer.connected)) H.timer = setTimeout(() => { H.timer = null; Engine.act(g, a.id, Engine.botDecide(g)); H.push(); }, 900 + Math.random() * 700);
    }
  };
  root.Host = Host;
})(window);
