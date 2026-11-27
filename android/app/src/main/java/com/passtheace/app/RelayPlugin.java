package com.passtheace.app;

import android.view.WindowManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;

/** Starts/stops the on-phone relay so this device can host a table over its own hotspot/Wi-Fi. */
@CapacitorPlugin(name = "Relay")
public class RelayPlugin extends Plugin {
    private RelayServer server;
    private int port;

    @PluginMethod
    public synchronized void start(PluginCall call) {
        try {
            stopServer();
            IOException last = null;
            for (int p = 3000; p < 3010 && server == null; p++) {
                RelayServer s = new RelayServer(p, path -> getContext().getAssets().open("public/" + path));
                try { s.start(0); server = s; port = p; } catch (IOException e) { last = e; }
            }
            if (server == null) { call.reject("Could not open a port: " + (last != null ? last.getMessage() : "")); return; }
            getActivity().runOnUiThread(() -> getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
            JSObject out = new JSObject();
            out.put("port", port);
            JSArray addrs = new JSArray();
            for (String a : localAddresses()) addrs.put(a);
            out.put("addresses", addrs);
            call.resolve(out);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public synchronized void stop(PluginCall call) {
        stopServer();
        getActivity().runOnUiThread(() -> getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
        call.resolve();
    }

    private void stopServer() { if (server != null) { server.stop(); server = null; } }

    @Override
    protected void handleOnDestroy() { stopServer(); }

    /** Private IPv4 addresses, hotspot (192.168.43.x / 192.168.x) first. */
    private static List<String> localAddresses() {
        List<String> found = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> ifs = NetworkInterface.getNetworkInterfaces();
            for (NetworkInterface ni : Collections.list(ifs)) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) found.add(a.getHostAddress());
                }
            }
        } catch (Exception ignored) { }
        Collections.sort(found, (x, y) -> score(y) - score(x));
        return found;
    }
    private static int score(String ip) {
        if (ip.startsWith("192.168.43.") || ip.startsWith("192.168.49.")) return 3; // Android hotspot / Wi-Fi Direct
        if (ip.startsWith("192.168.")) return 2;
        if (ip.startsWith("10.") || ip.startsWith("172.")) return 1;
        return 0;
    }
}
