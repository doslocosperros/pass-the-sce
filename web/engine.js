// Pure game engine. No DOM, no network. Runs on the host device only.
(function (root) {
  const SUITS = ['♠', '♥', '♦', '♣'];
  const LIVES = 3;
  const label = (r) => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[r] || String(r));

  function shuffle(a, rnd) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function newDeck(rnd) {
    const d = [];
    for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) d.push({ rank: r, suit: SUITS[s] });
    return shuffle(d, rnd);
  }

  // players: [{id, name, isBot}]
  function create(players, opts = {}) {
    const rnd = opts.rnd || Math.random;
    const s = {
      rnd, round: 0, phase: 'play', deck: [], log: [], reveal: null, winners: null,
      players: players.map((p) => ({ id: p.id, name: p.name, isBot: !!p.isBot, lives: LIVES, card: null, kingShown: false })),
      dealer: -1, turn: 0,
    };
    s.dealer = Math.floor(rnd() * s.players.length) - 1; // startRound advances to a random first dealer
    startRound(s);
    return s;
  }

  const alive = (s) => s.players.filter((p) => p.lives > 0);
  function nextAlive(s, i) {
    const n = s.players.length;
    for (let k = 1; k <= n; k++) { const j = (i + k) % n; if (s.players[j].lives > 0) return j; }
    return i;
  }
  const say = (s, m, type, ids) => { s.log.push(m); if (s.log.length > 30) s.log.shift(); s.ev = { n: ((s.ev && s.ev.n) || 0) + 1, type: type || 'info', ids: ids || [] }; };

  function startRound(s) {
    s.round++;
    s.phase = 'play'; s.reveal = null;
    s.deck = newDeck(s.rnd);
    s.players.forEach((p) => { p.card = null; p.kingShown = false; });
    alive(s).forEach((p) => { p.card = s.deck.pop(); });
    s.dealer = nextAlive(s, s.dealer < 0 ? s.players.length - 1 : s.dealer);
    s.turn = nextAlive(s, s.dealer);
    say(s, `Round ${s.round} — ${s.players[s.dealer].name} deals.`, 'deal');
  }

  function actor(s) { return s.players[s.turn]; }
  function swapTarget(s) { return s.turn === s.dealer ? null : s.players[nextAlive(s, s.turn)]; }

  function resolve(s) {
    const al = alive(s);
    const low = Math.min(...al.map((p) => p.card.rank));
    const losers = al.filter((p) => p.card.rank === low);
    const cards = {}; al.forEach((p) => { cards[p.id] = p.card; });
    losers.forEach((p) => { p.lives--; });
    s.phase = 'reveal';
    s.reveal = { cards, losers: losers.map((p) => p.id), low };
    say(s, `Low card ${label(low)} — ${losers.map((p) => p.name).join(' & ')} lose${losers.length === 1 ? 's' : ''} a life.`, 'lose', losers.map((p) => p.id));
  }

  // action: 'keep' | 'swap'
  function act(s, id, action) {
    if (s.phase !== 'play') return false;
    const me = actor(s);
    if (me.id !== id) return false;
    if (action === 'swap') {
      if (s.turn === s.dealer) {
        const top = s.deck.pop();
        s.deck.unshift(me.card); me.card = top;
        say(s, `${me.name} (dealer) swaps with the deck.`, 'deck', [me.id]);
      } else {
        const t = swapTarget(s);
        if (t.card.rank === 13) { t.kingShown = true; say(s, `${t.name} blocks ${me.name} with a King!`, 'block', [t.id, me.id]); }
        else { const c = me.card; me.card = t.card; t.card = c; say(s, `${me.name} swaps with ${t.name}.`, 'swap', [me.id, t.id]); }
      }
    } else if (action === 'keep') {
      say(s, `${me.name} keeps.`, 'keep', [me.id]);
    } else return false;
    if (s.turn === s.dealer) resolve(s); else s.turn = nextAlive(s, s.turn);
    return true;
  }

  // After the reveal: next round, or game over.
  function advance(s) {
    if (s.phase !== 'reveal') return;
    const al = alive(s);
    if (al.length === 0) { s.phase = 'over'; s.winners = s.reveal.losers.slice(); say(s, 'Everyone fell together — tie!', 'win'); }
    else if (al.length === 1) { s.phase = 'over'; s.winners = [al[0].id]; say(s, `${al[0].name} wins!`, 'win', [al[0].id]); }
    else startRound(s);
  }

  // Simple bot: only knows its own card.
  function botDecide(s) {
    const me = actor(s); const r = me.card.rank; const rnd = s.rnd;
    if (r === 13) return 'keep';
    const threshold = s.turn === s.dealer ? 7 : 6;
    const want = r <= threshold ? 'swap' : 'keep';
    return rnd() < 0.12 ? (want === 'swap' ? 'keep' : 'swap') : want;
  }

  // What a given player may see. Never leaks other players' hidden cards.
  function viewFor(s, id) {
    const reveal = s.phase === 'reveal' || s.phase === 'over';
    const me = s.players.find((p) => p.id === id);
    return {
      phase: s.phase, round: s.round, deckCount: s.deck.length,
      dealerId: s.players[s.dealer] && s.players[s.dealer].id,
      turnId: s.phase === 'play' ? actor(s).id : null,
      targetId: s.phase === 'play' && swapTarget(s) ? swapTarget(s).id : null,
      meId: id, myCard: me && me.card, log: s.log.slice(-6),
      reveal: s.reveal, winners: s.winners, ev: s.ev,
      seats: s.players.map((p) => ({
        id: p.id, name: p.name, isBot: p.isBot, lives: p.lives, alive: p.lives > 0,
        hasCard: p.card !== null,
        shown: (reveal && s.reveal && s.reveal.cards[p.id]) || (p.kingShown ? p.card : null),
      })),
    };
  }

  const api = { create, act, advance, botDecide, viewFor, label, LIVES, SUITS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
