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
  connectButton.textContent = active ? "Disconnect Phone" : "Connect Phone";
}

function send(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN || !connected) return false;
  socket.send(JSON.stringify(payload));
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
  const permission = requestSensors();
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
        if (data.type === "connected" && data.role === "controller") {
          setStatus("WebSocket connected", true);
          hideDialog();
          startSensors();
        }
      } catch (_) { /* ignore unrecognized relay control messages */ }
    });
    socket.addEventListener("close", (event) => {
      releaseSpace();
      stopSensors();
      setStatus("Disconnected");
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

connectButton.addEventListener("click", () => connected ? disconnect() : showDialog());
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
