/* Same-origin, same-device pairing without WebSockets, a relay, or room codes.
 * The host and controller can open in any two same-origin Safari windows/tabs.
 * A different ?session=... value isolates multiple demonstrations. */
(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  // Static files default to local mode; relay's / and /demo stay networked.
  const selection = params.get("local");
  const staticPage = location.pathname.endsWith("/index.html") ||
                     location.pathname.endsWith("/demo.html");
  const enabled = selection === "1" || (selection !== "0" && staticPage);
  const available = typeof BroadcastChannel === "function";
  const session = (params.get("session") || "default").slice(0, 80);
  const channel = enabled && available
    ? new BroadcastChannel("gyrored-local-v1:" + session)
    : null;
  const listeners = new Set();
  if (channel) {
    channel.addEventListener("message", event => {
      const envelope = event.data;
      if (!envelope || envelope.protocol !== "gyrored-local-v1") return;
      if (!["host", "controller"].includes(envelope.from)) return;
      if (!envelope.payload || typeof envelope.payload !== "object") return;
      for (const listener of listeners) listener(envelope.from, envelope.payload);
    });
  }
  // Visible failure reports for Instant Play's "What's happening?" panel.
  // This is intentionally local only; it does not upload logs anywhere.
  if (channel) {
    const role = location.pathname.endsWith("demo.html") ? "host" : "controller";
    const report = error => {
      channel.postMessage({
        protocol: "gyrored-local-v1",
        from: role,
        payload: {type: "diagnostic", error: String(error).slice(0, 600)}
      });
    };
    window.addEventListener("error", event => {
      report(event.message + " (" + (event.filename || "script") + ":" + event.lineno + ")");
    });
    window.addEventListener("unhandledrejection", event => {
      report(event.reason?.stack || event.reason || "Unhandled promise rejection");
    });
  }
  window.GyroLocal = {
    enabled,
    available,
    send(from, payload) {
      if (!channel) return false;
      channel.postMessage({protocol: "gyrored-local-v1", from, payload});
      return true;
    },
    listen(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
})();
