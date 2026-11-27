# Pass the Ace

Local multiplayer card game (2–6 players, hotspot/LAN, no internet). Casino theme.

## Run (test build)
    npm install
    npm start        # prints http://<lan-ip>:3000
Open it on the host, tap **Host a game**, pick 2–6 seats. Others open the same URL (or `/?code=ABCD`) and join. Bots fill empty seats.

## Layout
- `web/engine.js` – pure rules engine (host-only, per-player views hide other cards)
- `web/host.js`   – lobby, bots, authoritative state on the host device
- `web/net.js`    – transport (swap for native hotspot server / Nearby Connections in the APK)
- `server/relay.js` – dumb room relay + static server (no game logic)
- `test/` – `npm test`

## Rules implemented
3 lives, 1 card each, Ace low. Left of dealer acts first: keep or swap with the next player; a King blocks. Dealer may swap with the deck. Lowest card (ties included) loses a life. Last player standing wins.
