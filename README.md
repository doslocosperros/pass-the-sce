# Pass the Ace

Local multiplayer card game (2–6 players, hotspot/LAN, no internet). Casino theme.

## Play in a browser (test build)
    npm install
    npm start        # prints http://<lan-ip>:3000
Host taps **Host a game**, picks 2–6 seats, and shows a QR code. Others scan it with the phone camera (or open the URL and type the code). Bots fill empty seats. Dropped players auto-reconnect to the same seat; a bot plays for them meanwhile.

## Android APK
The host phone runs the relay itself (`RelayServer.java`, NanoHTTPD) and serves the game page, so **no laptop and no internet are needed**:
1. Host phone turns on its **hotspot**; other phones join that Wi-Fi.
2. Host opens the app → *Host a game* → shows the QR.
3. Other players scan it with their normal camera app — it opens the game in their browser (no install needed). Players who installed the APK can instead type the host address + code.

Build: GitHub Actions (`.github/workflows/android.yml`) produces `pass-the-ace-debug-apk`. Locally: `npm run android:sync && cd android && ./gradlew assembleDebug` (needs Android SDK + JDK 21).

## Layout
- `web/engine.js` – pure rules engine (host-only; per-player views hide other cards)
- `web/host.js` – lobby, bots, authoritative state on the host device
- `web/net.js` – transport (browser relay or native Relay plugin)
- `web/audio.js` – synthesized sound effects
- `server/relay.js` – Node relay + static server (dev)
- `android/` – Capacitor project; `RelayServer.java` is the on-phone relay (Java port of `relay.js`)
- `test/` – `npm test`; `test/jvm/RelayMain.java` runs the Android relay on a desktop JVM so the same protocol test can target it (`RELAY_PORT=3200 node test/relay.test.js`)

## Rules
3 lives, 1 card each, Ace low. Left of dealer acts first: keep or swap with the next player; a King blocks. Dealer may swap with the deck. Lowest card (ties included) loses a life. Last player standing wins.
