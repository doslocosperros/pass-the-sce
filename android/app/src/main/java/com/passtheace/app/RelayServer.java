package com.passtheace.app;

import fi.iki.elonen.NanoHTTPD;
import fi.iki.elonen.NanoWSD;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Random;

/**
 * Same protocol as server/relay.js: a dumb room relay + static file server on ONE port.
 * No game logic lives here; the host phone's WebView runs the engine.
 * No Android imports on purpose, so it can be unit-tested on a desktop JVM.
 */
public class RelayServer extends NanoWSD {

    public interface Assets { InputStream open(String path) throws IOException; }

    private static final String ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    private final Assets assets;
    private final Random rnd = new SecureRandom();
    private final Map<String, Room> rooms = new HashMap<>();

    private static class Room {
        Conn host;
        final Map<String, Conn> peers = new HashMap<>();
        final Map<String, String> tokens = new HashMap<>();
        int next = 1;
    }

    public RelayServer(int port, Assets assets) {
        super(port);
        this.assets = assets;
    }

    // ---------- static files ----------
    @Override
    protected Response serveHttp(IHTTPSession session) {
        String uri = session.getUri();
        if (uri.equals("/")) uri = "/index.html";
        if (uri.contains("..") || !uri.startsWith("/")) {
            return newFixedLengthResponse(Response.Status.FORBIDDEN, MIME_PLAINTEXT, "Forbidden");
        }
        try {
            InputStream in = assets.open(uri.substring(1));
            Response r = newChunkedResponse(Response.Status.OK, mime(uri), in);
            r.addHeader("Cache-Control", "no-store");
            return r;
        } catch (IOException e) {
            return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not found");
        }
    }

    private static String mime(String p) {
        p = p.toLowerCase(Locale.ROOT);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        return "application/octet-stream";
    }

    // ---------- websockets ----------
    @Override
    protected WebSocket openWebSocket(IHTTPSession handshake) {
        return new Conn(handshake);
    }

    private String newCode() {
        String c;
        do {
            StringBuilder b = new StringBuilder();
            for (int i = 0; i < 4; i++) b.append(ALPHA.charAt(rnd.nextInt(ALPHA.length())));
            c = b.toString();
        } while (rooms.containsKey(c));
        return c;
    }

    private String newToken() {
        byte[] b = new byte[8]; rnd.nextBytes(b);
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }

    private class Conn extends WebSocket {
        String room; String pid; boolean isHost;

        Conn(IHTTPSession h) { super(h); }

        void sendJson(JSONObject o) {
            try { if (isOpen()) send(o.toString()); } catch (IOException ignored) { }
        }

        @Override protected void onOpen() { }
        @Override protected void onPong(WebSocketFrame pong) { }
        @Override protected void onException(IOException exception) { }

        @Override
        protected void onMessage(WebSocketFrame frame) {
            try {
                JSONObject m = new JSONObject(frame.getTextPayload());
                synchronized (RelayServer.this) { handle(m); }
            } catch (JSONException ignored) { }
        }

        private void handle(JSONObject m) throws JSONException {
            String t = m.optString("t");
            if (t.equals("host") && room == null) {
                String c = newCode();
                Room r = new Room(); r.host = this; rooms.put(c, r);
                room = c; isHost = true;
                sendJson(new JSONObject().put("t", "hosting").put("code", c));
            } else if (t.equals("join") && room == null) {
                String code = m.optString("code").toUpperCase(Locale.ROOT);
                Room r = rooms.get(code);
                if (r == null) { sendJson(new JSONObject().put("t", "error").put("msg", "No game with that code.")); return; }
                String id, token;
                JSONObject rj = m.optJSONObject("rejoin");
                if (rj != null && rj.has("id") && r.tokens.containsKey(rj.optString("id"))
                        && r.tokens.get(rj.optString("id")).equals(rj.optString("token"))) {
                    id = rj.optString("id"); token = rj.optString("token");   // same seat, new socket
                    Conn old = r.peers.get(id);
                    if (old != null && old != this) { old.pid = null; old.room = null; try { old.close(WebSocketFrame.CloseCode.NormalClosure, "replaced", false); } catch (IOException ignored) { } }
                } else {
                    id = "p" + r.next++; token = newToken(); r.tokens.put(id, token);
                }
                r.peers.put(id, this); room = code; pid = id;
                sendJson(new JSONObject().put("t", "joined").put("id", id).put("token", token));
                String name = m.optString("name"); if (name.length() > 14) name = name.substring(0, 14);
                r.host.sendJson(new JSONObject().put("t", "peer-join").put("id", id).put("name", name));
            } else if (t.equals("send") && room != null) {
                Room r = rooms.get(room); if (r == null) return;
                JSONObject msg = m.optJSONObject("msg"); if (msg == null) return;
                if (isHost) {
                    String to = m.optString("to");
                    JSONObject out = new JSONObject().put("t", "msg").put("msg", msg);
                    if (to.equals("all")) { for (Conn p : r.peers.values()) p.sendJson(out); }
                    else { Conn p = r.peers.get(to); if (p != null) p.sendJson(out); }
                } else if (pid != null) {
                    r.host.sendJson(new JSONObject().put("t", "peer-msg").put("id", pid).put("msg", msg));
                }
            }
        }

        @Override
        protected void onClose(WebSocketFrame.CloseCode code, String reason, boolean initiatedByRemote) {
            synchronized (RelayServer.this) {
                if (room == null) return;
                Room r = rooms.get(room); if (r == null) return;
                try {
                    if (isHost) {
                        for (Conn p : r.peers.values()) {
                            p.sendJson(new JSONObject().put("t", "host-left"));
                            try { p.close(WebSocketFrame.CloseCode.NormalClosure, "host left", false); } catch (IOException ignored) { }
                        }
                        rooms.remove(room);
                    } else if (pid != null && r.peers.get(pid) == this) {
                        r.peers.remove(pid);
                        r.host.sendJson(new JSONObject().put("t", "peer-leave").put("id", pid));
                    }
                } catch (JSONException ignored) { }
            }
        }
    }
}
