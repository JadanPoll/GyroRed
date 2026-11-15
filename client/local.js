/* GyroRed local transport. One active host and controller per session.
 * Duplicate tabs remain visible but cannot transmit until explicitly selected.
 * BroadcastChannel is intentionally same-origin and same-device only.
 */
(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const selection = params.get("local");
  const staticPage = /\/(index|demo)\.html$/.test(location.pathname);
  const enabled = selection === "1" || (selection !== "0" && staticPage);
  const available = typeof BroadcastChannel === "function";
  const session = (params.get("session") || "default").slice(0, 80);
  const role = location.pathname.endsWith("demo.html") ? "host" : "controller";
  const identity = (crypto.randomUUID ? crypto.randomUUID() :
    Math.random().toString(36).slice(2) + Date.now().toString(36));
  const born = Date.now();
  let claim = 0;
  let active = false;
  let ready = false;
  const peers = new Map();
  const listeners = new Set();
  const roleListeners = new Set();
  const TTL = 7000;
  const wire = enabled && available
    ? new BroadcastChannel("gyrored-local-v1:" + session) : null;
  let banner;

  function compare(a, b) {
    // A user-selected tab beats an automatically opened one. Otherwise keep
    // the older instance active, rather than stealing input on every refresh.
    return (b.claim - a.claim) || (a.born - b.born) ||
      a.id.localeCompare(b.id);
  }

  function owner() {
    const now = Date.now();
    for (const [id, peer] of peers) {
      if (now - peer.seen > TTL) peers.delete(id);
    }
    const candidates = [{id: identity, born, claim},
      ...[...peers.values()].filter(p => p.role === role)];
    candidates.sort(compare);
    return candidates[0].id;
  }

  function warning() {
    if (!document.body) return;
    const blocked = ready && !active && wire;
    if (!blocked) {
      if (banner) banner.hidden = true;
      return;
    }
    if (!banner) {
      banner = document.createElement("aside");
      banner.setAttribute("role", "alert");
      banner.style.cssText =
        "position:fixed;z-index:9999;top:8px;left:8px;right:8px;" +
        "background:#432b11;color:#fff5de;border:2px solid #e5ad58;" +
        "border-radius:10px;padding:12px;font:14px system-ui;" +
        "box-shadow:0 8px 22px #0009";
      const message = document.createElement("p");
      message.style.margin = "0 0 9px";
      message.textContent = role === "controller"
        ? "Another controller tab is already in use for this game. This copy is paused."
        : "Another game tab is already active in this session. This copy is paused.";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Use this tab instead";
      button.style.cssText =
        "border:1px solid #f4bf79;border-radius:6px;background:#785019;" +
        "color:white;padding:9px 12px;cursor:pointer";
      button.addEventListener("click", () => {
        claim = Date.now();
        announce();
        evaluate();
      });
      banner.append(message, button);
      document.body.append(banner);
    }
    banner.hidden = false;
  }

  function evaluate() {
    if (!wire) return;
    const next = ready && owner() === identity;
    if (active !== next) {
      // Changing ownership has consequences: the old controller must release
      // held inputs, and the new owner must reannounce its state.
      active = next;
      for (const listener of roleListeners) listener(active);
    }
    warning();
  }

  function post(payload) {
    if (!wire) return;
    wire.postMessage({
      protocol: "gyrored-local-v1", from: role, sender: identity, payload
    });
  }

  function announce() {
    post({type:"__presence", born, claim});
  }

  if (wire) {
    wire.addEventListener("message", event => {
      const envelope = event.data;
      if (!envelope || envelope.protocol !== "gyrored-local-v1" ||
          !["host", "controller"].includes(envelope.from) ||
          typeof envelope.sender !== "string" ||
          envelope.sender === identity) return;
      const payload = envelope.payload;
      if (!payload || typeof payload !== "object") return;
      if (payload.type === "__presence") {
        peers.set(envelope.sender, {
          id: envelope.sender, role: envelope.from,
          born: Number(payload.born) || Date.now(),
          claim: Number(payload.claim) || 0, seen: Date.now()
        });
        evaluate();
        return;
      }
      if (payload.type === "__bye") {
        peers.delete(envelope.sender);
        evaluate();
        return;
      }
      // Only the elected sender may supply controls or actions. A stale or
      // duplicate tab cannot sneak commands through via a direct postMessage.
      const candidates = [{id: identity, role, born, claim},
        ...[...peers.values()].filter(p => Date.now() - p.seen <= TTL)];
      const fromRole = candidates.filter(p => p.role === envelope.from)
        .sort(compare);
      if (fromRole[0]?.id !== envelope.sender) return;
      for (const listener of listeners) listener(envelope.from, payload);
    });

    announce();
    setTimeout(() => {
      ready = true;
      evaluate();
      announce();
    }, 450);
    setInterval(() => {
      announce();
      evaluate();
    }, 1800);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        announce();
        evaluate();
      }
    });
    window.addEventListener("pagehide", () => {
      if (role === "controller" && active) {
        // Do not strand an old held Space/Brake on ordinary tab navigation.
        post({type:"unpress"});
        post({gravityaccelerometer:{x:0,y:0,z:0}});
      }
      post({type:"__bye"});
    });
    window.addEventListener("pageshow", () => {
      announce();
      evaluate();
    });

    const report = error => {
      post({type: "diagnostic", error: String(error).slice(0, 600)});
    };
    window.addEventListener("error", e =>
      report(e.message + " (" + (e.filename || "script") + ":" + e.lineno + ")"));
    window.addEventListener("unhandledrejection", e =>
      report(e.reason?.stack || e.reason || "Unhandled promise rejection"));
  }

  window.GyroLocal = {
    enabled, available, session, role,
    get active() { return active; },
    get blocked() { return ready && !active && !!wire; },
    send(from, payload) {
      if (!wire || !active || from !== role) return false;
      post(payload);
      return true;
    },
    listen(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onRoleChange(listener) {
      roleListeners.add(listener);
      // Callback is run after election; late subscribers must see current
      // state even when the initial 450 ms settlement already finished.
      if (ready) listener(active);
      return () => roleListeners.delete(listener);
    }
  };
})();
