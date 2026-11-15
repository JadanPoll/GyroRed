/* Same-origin, same-device pairing without WebSockets, a relay, or room codes.
 * The host and controller can open in any two same-origin Safari windows/tabs.
 * A different ?session=... value isolates multiple demonstrations. */
(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const enabled = params.get("local") === "1";
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
