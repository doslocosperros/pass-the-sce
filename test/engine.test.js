const assert = require('assert');
const E = require('../web/engine.js');
const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i, isBot: true }));

// 1. Many full bot games for every table size terminate with a winner
for (let n = 2; n <= 6; n++) {
  for (let g = 0; g < 300; g++) {
    const s = E.create(mk(n)); let guard = 0;
    while (s.phase !== 'over') {
      if (++guard > 2000) throw new Error('game did not end, n=' + n);
      if (s.phase === 'play') assert(E.act(s, s.players[s.turn].id, E.botDecide(s)));
      else E.advance(s);
    }
    assert(s.winners.length >= 1);
  }
}

// 2. King blocks swap; non-King swaps; dealer swaps with deck
const K = { rank: 13, suit: '♠' }, A = { rank: 1, suit: '♥' }, Q5 = { rank: 5, suit: '♦' };
let s = E.create(mk(3), { rnd: () => 0.5 });
const first = s.players[s.turn], next = s.players[(s.turn + 1) % 3];
first.card = A; next.card = K;
E.act(s, first.id, 'swap');
assert.strictEqual(first.card, A, 'blocked swap must not move cards'); assert(next.kingShown);
s = E.create(mk(3), { rnd: () => 0.5 });
const f2 = s.players[s.turn], n2 = s.players[(s.turn + 1) % 3];
f2.card = A; n2.card = Q5; E.act(s, f2.id, 'swap');
assert.strictEqual(f2.card, Q5); assert.strictEqual(n2.card, A);
const dealer = s.players[s.dealer];
const topBefore = s.deck[s.deck.length - 1];
// advance to dealer
while (s.players[s.turn] !== dealer) E.act(s, s.players[s.turn].id, 'keep');
E.act(s, dealer.id, 'swap');
assert.strictEqual(dealer.card, topBefore, 'dealer receives deck top');

// 3. Wrong player cannot act; ties both lose
s = E.create(mk(3), { rnd: () => 0.5 });
assert(!E.act(s, s.players.find((p) => p !== s.players[s.turn]).id, 'keep'));
s = E.create(mk(3), { rnd: () => 0.5 });
s.players.forEach((p, i) => { p.card = { rank: i === 0 ? 9 : 2, suit: '♠' }; });
while (s.phase === 'play') E.act(s, s.players[s.turn].id, 'keep');
assert.strictEqual(s.reveal.losers.length, 2); assert(s.players.filter((p) => p.lives === 2).length === 2);

// 4. Views never leak other players' hidden cards mid-round
s = E.create(mk(4));
const v = E.viewFor(s, 'p0');
v.seats.forEach((x) => { if (x.id !== 'p0') assert.strictEqual(x.shown, null, 'leak!'); });
assert.deepStrictEqual(v.myCard, s.players[0].card);
assert(!JSON.stringify(v).includes('"deck"'));
console.log('engine tests passed');
