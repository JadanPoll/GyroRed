"use strict";
const $ = id => document.getElementById(id);
const canvas = $("road"), ctx = canvas.getContext("2d");
const localTransport = window.GyroLocal;
const localMode = localTransport.enabled;
let ws = null, mode = "race", speed = 0, throttle = 48;
let x = 0, steer = 0, traveled = 0, camera = "Chase", braking = false;
let last = performance.now(), keySteer = 0, keyThrottle = false, keyBrake = false;
let swipeSteerUntil = 0;

function transmit(message) {
  if (localMode) {
    localTransport.send("host", message);
  } else if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function controls() {
  const regions = mode === "race" ? {
    top: [
      {id:"speed",kind:"text",text:"ROAD DEMO · Tilt to steer · " + camera},
      {id:"camera",kind:"select",label:"View",value:camera,options:["Chase","Cockpit","Top"]}
    ],
    actions: [
      {id:"throttle",kind:"slider",label:"Throttle",value:throttle,min:0,max:100,step:5,unit:"%"},
      {id:"brake",kind:"toggle",label:"Brake",value:braking},
      {id:"pit",kind:"button",label:"PIT STOP"}
    ]
  } : {
    top: [{id:"pit-title",kind:"text",text:"PIT STOP · Parked and waiting"}],
    actions: [
      {id:"tires",kind:"select",label:"Tire compound",value:"Medium",options:["Soft","Medium","Hard"]},
      {id:"refuel",kind:"slider",label:"Refuel",value:50,min:0,max:100,step:10,unit:"%"},
      {id:"resume",kind:"button",label:"RETURN TO TRACK"}
    ]
  };
  transmit({type:"ui.set",regions});
}

function controlAction(action) {
  if (action.type !== "ui.action") return;
  switch (action.id) {
    case "throttle": throttle = Math.max(0,Math.min(100,Number(action.value)||0)); break;
    case "brake": braking = action.value === true; break;
    case "camera": camera = ["Chase","Cockpit","Top"].includes(action.value) ? action.value : camera; break;
    case "pit": mode = "pit"; speed = 0; controls(); break;
    case "resume": mode = "race"; controls(); break;
    case "tires": $("connection").textContent = "Fitted " + action.value + " tires"; break;
    case "refuel": $("connection").textContent = "Refuel " + action.value + "%"; break;
  }
}

function handleControlMessage(message) {
  if (message.type === "hello") {
    $("connection").textContent = "Local controller connected";
    controls();
  } else if (message.type === "ui.action") {
    controlAction(message);
  } else if (message.gravityaccelerometer) {
    const y = Number(message.gravityaccelerometer.y);
    if (Number.isFinite(y)) steer = Math.max(-1,Math.min(1, y / 7));
  } else if (message.type === "press") {
    braking = true;
  } else if (message.type === "unpress") {
    braking = false;
  } else if (message.type === "swipe") {
    if (message.direction === "left" || message.direction === "right") {
      steer = message.direction === "left" ? -0.6 : 0.6;
      swipeSteerUntil = performance.now() + 400;
    }
  }
}

$("join").addEventListener("click", () => {
  const room = $("room").value.trim();
  if (!room) { $("connection").textContent = "Enter room code"; return; }
  if (ws) ws.close();
  const base = new URL(location.href);
  base.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = "/ws";
  base.search = "";
  base.searchParams.set("role","host");
  base.searchParams.set("room",room);
  ws = new WebSocket(base.toString());
  $("connection").textContent = "Connecting…";
  ws.addEventListener("message", event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === "connected" && message.role === "host") {
      $("connection").textContent = "Host connected";
      controls();
    } else {
      handleControlMessage(message);
    }
  });
  ws.addEventListener("close", () => $("connection").textContent = "Host disconnected");
  ws.addEventListener("error", () => $("connection").textContent = "Cannot connect — check room");
});

if (localMode) {
  $("room").closest("label").hidden = true;
  $("join").hidden = true;
  if (!localTransport.available) {
    $("connection").textContent = "BroadcastChannel unsupported";
  } else {
    $("connection").textContent = "Local mode · waiting for controller";
    localTransport.listen((from, message) => {
      if (from === "controller") handleControlMessage(message);
    });
    controls();
    localTransport.send("host", {type: "hello"});
    window.addEventListener("pageshow", () => {
      controls();
      localTransport.send("host", {type: "hello"});
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        controls();
        localTransport.send("host", {type: "hello"});
      }
    });
    window.addEventListener("pagehide", () => {
      localTransport.send("host", {type: "bye"});
    });
  }
}

document.addEventListener("keydown", event => {
  if (event.target.tagName === "INPUT") return;
  if (event.key === "ArrowLeft") keySteer = -1;
  if (event.key === "ArrowRight") keySteer = 1;
  if (event.key === "ArrowUp") keyThrottle = true;
  if (event.code === "Space") keyBrake = true;
  if (event.key.toLowerCase() === "p") {
    mode = mode === "race" ? "pit" : "race"; if (mode === "pit") speed = 0; controls();
  }
});
document.addEventListener("keyup", event => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") keySteer = 0;
  if (event.key === "ArrowUp") keyThrottle = false;
  if (event.code === "Space") keyBrake = false;
});

function draw(now) {
  const dt = Math.min((now - last)/1000, .05);
  last = now;
  const activeThrottle = keyThrottle ? 100 : throttle;
  const activeBrake = braking || keyBrake;
  if (mode === "race") {
    speed += ((activeBrake ? -220 : activeThrottle * 1.8) - speed * .72) * dt;
    speed = Math.max(0,Math.min(220,speed));
    const turning = keySteer || ((swipeSteerUntil && performance.now() > swipeSteerUntil) ? 0 : steer);
    x = Math.max(-1.38,Math.min(1.38,x + turning * dt * (0.3 + speed/130)));
    traveled += speed*dt / 3.6;
  } else speed = 0;
  const w=canvas.width,h=canvas.height;
  ctx.fillStyle="#15281b";ctx.fillRect(0,0,w,h);
  ctx.fillStyle="#242c29";ctx.fillRect(145,0,510,h);
  ctx.fillStyle="#8ac78e";ctx.fillRect(145,0,5,h);ctx.fillRect(650,0,5,h);
  const offset = (traveled*30)%90;
  ctx.strokeStyle="#b0bdb4";ctx.lineWidth=4;ctx.setLineDash([42,48]);ctx.lineDashOffset=-offset;
  for(const lane of [315,485]){ctx.beginPath();ctx.moveTo(lane,0);ctx.lineTo(lane,h);ctx.stroke()}
  ctx.setLineDash([]);ctx.lineDashOffset=0;
  const cx=400+x*150, cy=300;
  ctx.save();ctx.translate(cx,cy);ctx.rotate(-(keySteer||((swipeSteerUntil && performance.now() > swipeSteerUntil) ? 0 : steer))*.08);
  ctx.fillStyle="#131313";ctx.fillRect(-30,-53,60,112);
  ctx.fillStyle="#46db51";ctx.fillRect(-26,-49,52,104);
  ctx.fillStyle="#08381d";ctx.fillRect(-20,-27,40,31);
  ctx.fillStyle="#fff4c4";ctx.fillRect(-24,-50,13,8);ctx.fillRect(11,-50,13,8);
  ctx.restore();
  ctx.fillStyle="#eef6e8";ctx.font="bold 20px system-ui";
  ctx.fillText("GYRORED / "+mode.toUpperCase(),22,36);
  ctx.font="16px ui-monospace,monospace";
  ctx.fillText(Math.round(speed)+" km/h",22,64);
  ctx.fillText("Steering "+Math.round((keySteer||((swipeSteerUntil && performance.now() > swipeSteerUntil) ? 0 : steer))*100)+"%",22,88);
  if(mode==="pit"){ctx.fillStyle="#051009d9";ctx.fillRect(190,135,420,150);
    ctx.fillStyle="#b3f8ac";ctx.font="bold 30px system-ui";ctx.fillText("PIT STOP",316,196);
    ctx.font="16px system-ui";ctx.fillText("Use the phone's new pit UIlets",270,233)}
  $("telemetry").textContent="Speed "+Math.round(speed)+" · Gear "+Math.max(1,Math.ceil(speed/37))+" · "+mode;
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
