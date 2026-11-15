"use strict";

/* GyroRed phone client — original protocol with native browser sensors. */
const $ = (id) => document.getElementById(id);
const backdrop = $("backdrop");
const status = $("status");
const roomInput = $("room");
const relayInput = $("relay");
const errorLabel = $("dialogError");
const connectButton = $("connectButton");
const hold = $("hold");
const canvas = $("gyroCanvas");
const context = canvas.getContext("2d");
const profileButtons = [...document.querySelectorAll("[data-profile]")];
const defaultScheme = location.protocol === "https:" ? "wss:" : "ws:";
relayInput.value = defaultScheme + "//" + location.host + "/ws";
const localTransport = window.GyroLocal;
const localMode = localTransport.enabled;
let localGameReady = false;

let socket = null;
let counter = 0;
let lastSend = 0;
let pitch = 0, roll = 0;
let targetPitch = 0, targetRoll = 0;
let frameId = null;
let dragging = null;
let holding = false;
let closing = false;
let connected = false;
let profile = "Nathan A";
let motionGranted = false;

function setStatus(message, active = false) {
  status.textContent = message;
  status.classList.toggle("online", active);
  connected = active;
  connectButton.textContent = localMode
    ? (motionGranted ? "Motion enabled" : "Enable motion")
    : (active ? "Disconnect Phone" : "Connect Phone");
}

function send(payload) {
  if (!connected) return false;
  if (localMode) {
    if (!localTransport.send("controller", payload)) return false;
  } else {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
  }
  $("eventCount").textContent = String(++counter);
  return true;
}

function releaseSpace() {
  if (!holding) return;
  holding = false;
  send({type: "unpress"});
}

function disconnect() {
  closing = true;
  releaseSpace();
  stopSensors();
  if (socket) {
    socket.close(1000, "User disconnected");
    socket = null;
  }
  setStatus("Disconnected");
  clearUI();
}

function showDialog() {
  backdrop.classList.remove("hidden");
  errorLabel.textContent = "";
}

function hideDialog() {
  backdrop.classList.add("hidden");
}

async function requestSensors() {
  if (!window.isSecureContext) {
    throw new Error("Motion sensors require HTTPS (or localhost).");
  }
  if (!("DeviceMotionEvent" in window) && !("DeviceOrientationEvent" in window)) {
    throw new Error("This browser does not expose device motion sensors.");
  }
  // iOS Safari requires requests inside a user-activation callback. This
  // function is called directly from the Connect form's submit event.
  const requests = [];
  if (typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function") {
    requests.push(DeviceMotionEvent.requestPermission());
  }
  if (typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function") {
    requests.push(DeviceOrientationEvent.requestPermission());
  }
  const permissions = await Promise.all(requests);
  if (permissions.some((result) => result !== "granted")) {
    throw new Error("Motion sensor permission was denied.");
  }
  motionGranted = true;
}

function startSensors() {
  window.addEventListener("devicemotion", onMotion);
  window.addEventListener("deviceorientation", onOrientation);
}

function stopSensors() {
  window.removeEventListener("devicemotion", onMotion);
  window.removeEventListener("deviceorientation", onOrientation);
}

function onMotion(event) {
  // The original receiver expects the acceleration INCLUDING gravity.
  const a = event.accelerationIncludingGravity;
  if (!a) return;
  const current = performance.now();
  if (current - lastSend < 33) return; // limit to about 30 events / second
  lastSend = current;
  const values = [a.x, a.y, a.z].map((value) =>
    Number.isFinite(value) ? value : null
  );
  if (values.some((value) => value === null)) return;
  send({gravityaccelerometer: {x: values[0], y: values[1], z: values[2]}});
  targetPitch = (values[1] / 9.5) * 70;
  targetRoll = -(values[2] / 9.5) * 60;
}

function onOrientation(event) {
  if (![event.alpha, event.beta, event.gamma].some(Number.isFinite)) return;
  // Orientation is sent separately, matching the historical Python receiver.
  const current = performance.now();
  if (current - orientationSent < 100) return;
  orientationSent = current;
  send({orientation: {
    alpha: Number.isFinite(event.alpha) ? event.alpha : null,
    beta: Number.isFinite(event.beta) ? event.beta : null,
    gamma: Number.isFinite(event.gamma) ? event.gamma : null
  }});
}
let orientationSent = 0;

function connect(event) {
  event.preventDefault();
  errorLabel.textContent = "";
  const room = roomInput.value.trim();
  if (!room) { errorLabel.textContent = "Enter the desktop room code."; return; }
  let relay;
  try {
    relay = new URL(relayInput.value.trim());
    if (!["wss:", "ws:"].includes(relay.protocol)) {
      throw new Error("WebSocket address must begin with ws:// or wss://");
    }
    if (location.protocol === "https:" && relay.protocol !== "wss:") {
      throw new Error("An HTTPS page requires a secure wss:// connection.");
    }
  } catch (error) {
    errorLabel.textContent = error.message || "Invalid WebSocket address.";
    return;
  }

  // Ask permission in this click-triggered handler BEFORE awaiting any
  // network handshake so iOS retains the user-gesture permission context.
  const permission = requestSensors().catch((error) => {
    motionGranted = false;
    console.warn("Motion unavailable; touch controls still work:", error.message);
    return false;
  });
  setStatus("Requesting motion permission…");
  permission.then(() => {
    disconnect();
    closing = false;
    setStatus("Connecting…");
    relay.searchParams.set("role", "controller");
    relay.searchParams.set("room", room);
    try {
      socket = new WebSocket(relay.toString());
    } catch (error) {
      errorLabel.textContent = error.message;
      showDialog();
      return;
    }
    socket.addEventListener("open", () => {
      // Await relay's connected acknowledgement before sending controls.
      setStatus("Pairing…");
    });
    socket.addEventListener("message", (message) => {
      try {
        const data = JSON.parse(message.data);
        if (data.type === "ui.set") renderUI(data.regions);
        if (data.type === "connected" && data.role === "controller") {
          setStatus(motionGranted ? "WebSocket connected" : "Connected · touch only", true);
          hideDialog();
          startSensors();
        }
      } catch (_) { /* ignore unrecognized relay control messages */ }
    });
    socket.addEventListener("close", (event) => {
      releaseSpace();
      stopSensors();
      setStatus("Disconnected");
      clearUI();
      if (!closing) {
        errorLabel.textContent = event.code === 1006
          ? "Connection failed. Check relay address, room code, and server."
          : "Connection closed (" + event.code + ").";
        showDialog();
      }
    });
    socket.addEventListener("error", () => {
      errorLabel.textContent = "Could not reach relay or join the room.";
    });
  }).catch((error) => {
    setStatus("Sensor permission required");
    errorLabel.textContent = error.message;
  });
}

connectButton.addEventListener("click", () => {
  if (localMode) {
    if (!localTransport.available) return;
    if (motionGranted) {
      releaseSpace();
      stopSensors();
      motionGranted = false;
      setStatus("Local · touch controls ready", true);
      return;
    }
    // Direct click handler: Safari requires user activation to ask for sensors.
    requestSensors().then(() => {
      startSensors();
      setStatus(localGameReady ? "Local · game connected · motion on" : "Looking for game · motion on", localGameReady);
    }).catch(error => {
      status.textContent = "Touch active · " + error.message;
    });
    return;
  }
  connected ? disconnect() : showDialog();
});
$("cancel").addEventListener("click", hideDialog);
$("connectForm").addEventListener("submit", connect);
profileButtons.forEach((button) => {
  button.addEventListener("click", () => {
    profile = button.dataset.profile;
    profileButtons.forEach((b) => b.classList.toggle("selected", b === button));
  });
});
profileButtons[0].classList.add("selected");

document.querySelectorAll("[data-quadrant]").forEach((button) => {
  button.addEventListener("click", () => send({
    type: "tap", quadrant: Number(button.dataset.quadrant)
  }));
});

hold.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  hold.setPointerCapture(event.pointerId);
  if (!holding && send({type: "press"})) holding = true;
});
for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
  hold.addEventListener(eventName, releaseSpace);
}
window.addEventListener("blur", releaseSpace);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) releaseSpace();
});

// Swipes are recognized inside the lower controller area, excluding buttons.
// Four discrete swipe events match the original receiver.
const controls = document.querySelector(".controls");
controls.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button")) return;
  dragging = {x: event.clientX, y: event.clientY, id: event.pointerId};
});
controls.addEventListener("pointerup", (event) => {
  if (!dragging || event.pointerId !== dragging.id) return;
  const dx = event.clientX - dragging.x, dy = event.clientY - dragging.y;
  dragging = null;
  if (Math.hypot(dx, dy) < 35) return;
  send({type: "swipe", direction: Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up")});
});
controls.addEventListener("pointercancel", () => { dragging = null; });

function draw() {
  const box = canvas.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(box.width * ratio) ||
      canvas.height !== Math.round(box.height * ratio)) {
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, box.width, box.height);
  pitch += (targetPitch - pitch) * 0.06;
  roll += (targetRoll - roll) * 0.06;
  $("pitch").textContent = pitch.toFixed(1) + "°";
  $("roll").textContent = roll.toFixed(1) + "°";
  const ax = roll * Math.PI / 180, az = pitch * Math.PI / 180;
  const vertices = [
    [-1.25,-.5,-.25], [1.25,-.5,-.25], [1.25,.5,-.25], [-1.25,.5,-.25],
    [-1.25,-.5,.25], [1.25,-.5,.25], [1.25,.5,.25], [-1.25,.5,.25]
  ];
  const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  const unit = Math.min(box.width / 3.6, box.height / 2.3);
  const points = vertices.map(([x,y,z]) => {
    const y1 = y * Math.cos(ax) - z * Math.sin(ax);
    const z1 = y * Math.sin(ax) + z * Math.cos(ax);
    const x2 = x * Math.cos(az) - y1 * Math.sin(az);
    const y2 = x * Math.sin(az) + y1 * Math.cos(az);
    const perspective = 4 / (4 - z1);
    return [box.width / 2 + x2 * unit * perspective,
            box.height / 2 + y2 * unit * perspective];
  });
  context.strokeStyle = "#49e72c";
  context.lineWidth = 1.8;
  context.beginPath();
  edges.forEach(([a,b]) => {
    context.moveTo(...points[a]);
    context.lineTo(...points[b]);
  });
  context.stroke();
  frameId = requestAnimationFrame(draw);
}
frameId = requestAnimationFrame(draw);

/* Host-defined UIlets: declarative components, never host-supplied HTML/scripts. */
const uiletRoots = {};
for (const name of ["top", "actions", "bottom"]) {
  const root = document.createElement("section");
  root.className = "uilet-root";
  root.setAttribute("aria-label", "Host controls: " + name);
  root.dataset.region = name;
  if (name === "top") document.querySelector(".canvas-wrap").insertAdjacentElement("beforebegin", root);
  if (name === "actions") document.querySelector(".controls").insertAdjacentElement("beforebegin", root);
  if (name === "bottom") document.querySelector(".controls").insertAdjacentElement("afterend", root);
  uiletRoots[name] = root;
}

function uiAction(id, value, phase = "change") {
  send({type: "ui.action", id, value, phase});
}
function clearUI() {
  Object.values(uiletRoots).forEach(root => root.replaceChildren());
}
function uiElement(tag, className, labelText) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (labelText !== undefined) el.textContent = String(labelText).slice(0, 120);
  return el;
}
function renderUI(regions) {
  clearUI();
  if (!regions || typeof regions !== "object") return;
  for (const regionName of ["top", "actions", "bottom"]) {
    const items = regions[regionName];
    if (!Array.isArray(items) || !items.length) continue;
    const region = uiElement("div", "uilet-region");
    region.dataset.region = regionName;
    const name = uiElement("div", "uilet-region-name", regionName);
    region.append(name);
    for (const descriptor of items.slice(0, 40)) {
      if (!descriptor || typeof descriptor !== "object" ||
          !/^[a-zA-Z0-9_.:-]{1,64}$/.test(descriptor.id || "")) continue;
      const id = descriptor.id;
      const kind = descriptor.kind;
      const label = String(descriptor.label || id).slice(0, 80);
      const item = uiElement("div", "uilet");
      if (kind === "text") {
        item.append(uiElement("p", "uilet-text", descriptor.text || label));
      } else if (kind === "spacer") {
        item.classList.add("uilet-spacer");
      } else if (kind === "button") {
        const button = uiElement("button", "uilet-button", label);
        button.type = "button";
        button.disabled = descriptor.disabled === true;
        button.addEventListener("click", () => uiAction(id, true, "press"));
        item.append(button);
      } else if (kind === "toggle") {
        const row = uiElement("label", "uilet-toggle");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = descriptor.value === true;
        input.disabled = descriptor.disabled === true;
        input.addEventListener("change", () => uiAction(id, input.checked));
        row.append(input, document.createTextNode(label));
        item.append(row);
      } else if (kind === "slider" || kind === "meter") {
        const title = uiElement("label", "uilet-label", label);
        const number = uiElement("output", "uilet-value");
        const input = document.createElement("input");
        const min = Number.isFinite(descriptor.min) ? descriptor.min : 0;
        const max = Number.isFinite(descriptor.max) && descriptor.max > min ? descriptor.max : 100;
        const value = Number.isFinite(descriptor.value) ? descriptor.value : min;
        input.min = String(min);
        input.max = String(max);
        input.value = String(Math.max(min, Math.min(max, value)));
        number.textContent = input.value + (descriptor.unit || "");
        if (kind === "slider") {
          input.type = "range";
          input.step = String(Number.isFinite(descriptor.step) && descriptor.step > 0 ? descriptor.step : 1);
          input.disabled = descriptor.disabled === true;
          let last = 0;
          input.addEventListener("input", () => {
            number.textContent = input.value + (descriptor.unit || "");
            const now = performance.now();
            if (now - last > 45) {
              last = now;
              uiAction(id, Number(input.value));
            }
          });
          input.addEventListener("change", () => uiAction(id, Number(input.value)));
        } else {
          input.type = "range";
          input.disabled = true;
        }
        item.append(title, number, input);
      } else if (kind === "select") {
        const title = uiElement("label", "uilet-label", label);
        const select = uiElement("select", "uilet-select");
        for (const option of (Array.isArray(descriptor.options) ? descriptor.options.slice(0, 24) : [])) {
          if (typeof option !== "string" || option.length > 80) continue;
          const element = uiElement("option", "", option);
          element.value = option;
          select.append(element);
        }
        select.value = descriptor.value;
        select.disabled = descriptor.disabled === true;
        select.addEventListener("change", () => uiAction(id, select.value));
        item.append(title, select);
      } else {
        continue;
      }
      region.append(item);
    }
    uiletRoots[regionName].append(region);
  }
}


// The instant-play layout emphasizes game-supplied actions. Legacy buttons
// remain one tap away for the old Python keyboard receiver.
if (localMode && new URLSearchParams(location.search).get("compact") === "1") {
  document.body.classList.add("compact");
  const legacy = document.querySelector(".controls");
  const details = document.createElement("details");
  details.className = "legacy-controls";
  const summary = document.createElement("summary");
  summary.textContent = "Original A / N / R and Space controls";
  legacy.replaceWith(details);
  details.append(summary, legacy);
}

// No room, server, or pairing UI in same-device Safari mode.
if (localMode) {
  hideDialog();
  if (!localTransport.available) {
    setStatus("BroadcastChannel is not supported in this browser");
    connectButton.disabled = true;
  } else {
    setStatus("Looking for game", false);
    localTransport.listen((from, message) => {
      if (from !== "host") return;
      if (message.type === "ui.set") {
        localGameReady = true;
        renderUI(message.regions);
        setStatus(motionGranted ? "Game connected · motion on" : "Game connected · touch ready", true);
      } else if (message.type === "hello") {
        localTransport.send("controller", {type: "hello"});
      } else if (message.type === "bye") {
        releaseSpace();
        localGameReady = false;
        clearUI();
        setStatus("Game disconnected · looking for game", false);
      }
    });
    const announce = () => localTransport.send("controller", {type: "hello"});
    announce();
    window.addEventListener("pageshow", announce);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) announce();
      else releaseSpace();
    });
  }
}
