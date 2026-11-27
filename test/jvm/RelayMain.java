import com.passtheace.app.RelayServer;
import java.io.FileInputStream;
import java.nio.file.Paths;

/** Desktop harness: runs the exact RelayServer used in the APK, serving ./web from disk. */
public class RelayMain {
    public static void main(String[] a) throws Exception {
        int port = Integer.parseInt(a[0]); String web = a[1];
        RelayServer s = new RelayServer(port, p -> new FileInputStream(Paths.get(web, p).toFile()));
        s.start(0);
        System.out.println("java relay on " + port);
        Thread.currentThread().join();
    }
}
