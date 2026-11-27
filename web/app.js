(function () {
  const app = document.getElementById('app');
  const $ = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

  let net = null, host = null, role = null, myId = null, lastView = null;

  // ---------- screens ----------
  function home(msg) {
    role = null; net && net.close(); net = null; host = null;
    app.innerHTML = '';
    app.append($(`<section class="panel center">
      <h1>♠ Pass the Ace ♥</h1>
      <p class="sub">Local multiplayer · 2–6 players · no internet needed</p>
      <input id="name" maxlength="14" placeholder="Your name" value="${esc(store.get('name'))}">
      <div class="row">
        <button id="hostBtn" class="gold">Host a game</button>
      </div>
      <div class="or">— or join —</div>
      <div class="row">
        <input id="code" maxlength="4" placeholder="CODE" class="code">
        <button id="joinBtn">Join</button>
      </div>
      <p class="err" id="err">${msg ? esc(msg) : ''}</p>
    </section>`));
    const name = () => { const n = document.getElementById('name').value.trim() || 'Player'; store.set('name', n); return n; };
    document.getElementById('hostBtn').onclick = () => startHost(name());
    document.getElementById('joinBtn').onclick = () => startJoin(name(), document.getElementById('code').value.trim().toUpperCase());
    const q = new URLSearchParams(location.search).get('code'); if (q) document.getElementById('code').value = q.toUpperCase();
  }
  const err = (m) => { const e = document.getElementById('err'); if (e) e.textContent = m; };

  function startHost(name) {
    net = Net.open({
      onopen: () => net.send({ t: 'host' }),
      onclose: () => { if (role === 'host') home('Relay connection lost.'); },
      onerror: () => err('Could not reach the relay. Is `npm start` running?'),
      onmessage: (m) => {
        if (m.t === 'hosting') { role = 'host'; myId = 'host'; host = new Host(net, name, render); host.code = m.code; host.push(); }
        else if (m.t === 'peer-join') host.peerJoin(m.id, m.name);
        else if (m.t === 'peer-leave') host.peerLeave(m.id);
        else if (m.t === 'peer-msg') host.peerMsg(m.id, m.msg);
      },
    });
  }
  function startJoin(name, code) {
    if (code.length !== 4) return err('Enter the 4-letter code.');
    net = Net.open({
      onopen: () => net.send({ t: 'join', code, name }),
      onclose: () => { if (role === 'client') home('Disconnected from host.'); },
      onerror: () => err('Could not reach the host.'),
      onmessage: (m) => {
        if (m.t === 'joined') { role = 'client'; myId = m.id; render({ phase: 'lobby', seats: [], meId: m.id, code, maxSeats: 0 }); }
        else if (m.t === 'error') err(m.msg);
        else if (m.t === 'host-left') home('The host left the game.');
        else if (m.t === 'msg') {
          if (m.msg.t === 'view') render(m.msg.view);
          else if (m.msg.t === 'full') home('That game is full or already started.');
        }
      },
    });
  }
  const act = (a) => { if (role === 'host') host.action('host', a); else net.send({ t: 'send', msg: { t: 'action', a } }); };

  // ---------- rendering ----------
  function render(v) {
    lastView = v;
    if (v.phase === 'lobby') return renderLobby(v);
    renderTable(v);
  }

  function renderLobby(v) {
    const isHost = role === 'host';
    const url = `${location.origin}/?code=${v.code || ''}`;
    const seats = [];
    for (let i = 0; i < Math.max(v.maxSeats, v.seats.length); i++) {
      const s = v.seats[i];
      seats.push(s ? `<li class="${s.isBot ? 'bot' : ''}">${esc(s.name)}${s.id === v.meId ? ' (you)' : ''}${s.isBot ? ' 🤖' : ''}</li>` : '<li class="empty">open seat</li>');
    }
    app.innerHTML = '';
    app.append($(`<section class="panel center">
      <h2>Table code</h2>
      <div class="bigcode">${esc(v.code || '')}</div>
      <p class="sub">Phones: join the same hotspot, open<br><b>${esc(location.host)}</b> and enter the code.</p>
      ${isHost ? `<div class="row"><label>Players
          <select id="seats">${[2, 3, 4, 5, 6].map((n) => `<option ${n === v.maxSeats ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="chk"><input type="checkbox" id="bots" ${v.fillBots ? 'checked' : ''}> Fill empty seats with bots</label></div>` : `<p class="sub">Waiting for the host to start…</p>`}
      <ul class="seats">${seats.join('')}</ul>
      ${isHost ? `<div class="row"><button id="addBot">+ Bot</button><button id="start" class="gold">Deal ♠</button></div>` : ''}
      <button id="leave" class="link">Leave</button>
    </section>`));
    document.getElementById('leave').onclick = () => home();
    if (isHost) {
      document.getElementById('seats').onchange = (e) => host.setMaxSeats(+e.target.value);
      document.getElementById('bots').onchange = (e) => host.setFillBots(e.target.checked);
      document.getElementById('addBot').onclick = () => host.addBot();
      document.getElementById('start').onclick = () => { if (host.start() === false) alert('Need at least 2 players (add a bot).'); };
    }
  }

  const SUITCLR = (s) => (s === '♥' || s === '♦' ? 'red' : 'blk');
  const cardEl = (c, cls = '') => c
    ? `<div class="card ${cls} ${SUITCLR(c.suit)}"><span class="r">${Engine.label(c.rank)}</span><span class="s">${c.suit}</span></div>`
    : `<div class="card back ${cls}"></div>`;

  function renderTable(v) {
    const n = v.seats.length;
    const meIdx = Math.max(0, v.seats.findIndex((s) => s.id === v.meId));
    const myTurn = v.turnId === v.meId;
    const seatHtml = v.seats.map((s, i) => {
      const k = (i - meIdx + n) % n;
      const th = Math.PI / 2 + (k / n) * 2 * Math.PI;
      const x = 50 + 41 * Math.cos(th), y = 50 + 37 * Math.sin(th);
      const isMe = s.id === v.meId;
      const lost = v.reveal && v.reveal.losers.includes(s.id);
      const face = isMe && v.myCard && v.phase !== 'reveal' ? v.myCard : s.shown;
      const cls = ['seat', s.alive ? '' : 'out', s.id === v.turnId ? 'turn' : '', s.id === v.targetId ? 'target' : '', lost ? 'lost' : '', isMe ? 'me' : '', s.connected === false ? 'dc' : ''].join(' ');
      const hearts = '♥'.repeat(Math.max(0, s.lives)) + '<span class="dim">' + '♥'.repeat(Math.max(0, Engine.LIVES - s.lives)) + '</span>';
      return `<div class="${cls}" style="left:${x}%;top:${y}%">
        ${s.hasCard || s.shown ? cardEl(face, isMe ? 'big' : '') : '<div class="card none"></div>'}
        <div class="nm">${s.id === v.dealerId ? '<i class="dealer">D</i>' : ''}${esc(s.name)}${s.isBot ? ' 🤖' : ''}${s.connected === false ? ' ⚠' : ''}</div>
        <div class="lives">${hearts}</div>
        ${s.id === v.targetId ? '<div class="tag">swap target</div>' : ''}</div>`;
    }).join('');

    let controls = '';
    if (v.phase === 'play') {
      const meDealer = v.dealerId === v.meId;
      const tgt = v.seats.find((s) => s.id === v.targetId);
      controls = myTurn
        ? `<button id="keep">Keep</button><button id="swap" class="gold">${meDealer ? 'Swap with deck' : 'Swap with ' + esc(tgt ? tgt.name : '…')}</button>`
        : `<span class="wait">${esc((v.seats.find((s) => s.id === v.turnId) || {}).name || '')} is deciding…</span>`;
    } else if (v.phase === 'reveal') {
      controls = `<span class="wait">Reveal — lowest card loses a life</span>`;
    } else if (v.phase === 'over') {
      const names = v.winners.map((id) => v.seats.find((s) => s.id === id).name).join(' & ');
      controls = `<div class="win">🏆 ${esc(names)} wins!</div>` + (role === 'host' ? '<button id="again" class="gold">Back to lobby</button>' : '') + '<button id="leave" class="link">Leave</button>';
    }

    app.innerHTML = '';
    app.append($(`<section class="game">
      <div class="top"><span>Round ${v.round}</span><span>Deck ${v.deckCount}</span><button id="quit" class="link">Quit</button></div>
      <div class="table"><div class="felt">
        <div class="log">${v.log.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
      </div>${seatHtml}</div>
      <div class="controls">${controls}</div>
    </section>`));
    const on = (id, f) => { const e = document.getElementById(id); if (e) e.onclick = f; };
    on('keep', () => act('keep')); on('swap', () => act('swap'));
    on('again', () => host.playAgain()); on('leave', () => home()); on('quit', () => { if (confirm('Leave the game?')) home(); });
  }

  home();
})();
