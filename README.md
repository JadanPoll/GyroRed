# GyroRed

**Turn a phone or tablet into a motion gamepad and a host-programmable second screen.**

GyroRed is a revived 2024 experiment. The original browser controller and Python OpenGL/keyboard adapter are preserved in spirit, with a new bidirectional WebSocket protocol and **UIlets**: the running game can push interactive controls to the mobile device without shipping client code.

## Try the complete demo

Requires Python 3.10+.

```bash
pip install -r requirements.txt
python relay.py
```

The server prints a private **room code**. Open these two pages:

| Device | Page | Purpose |
| --- | --- | --- |
| Desktop/laptop | `http://localhost:8765/demo` | Playable driving demo (host) |
| Phone/tablet | Relay's base URL, `/` | Motion gamepad with host-driven UIlets |

1. On the desktop demo, enter the room code printed by `relay.py` and click **Connect host**.
2. On the phone, open the controller URL, tap **Connect Phone**, enter the **same room code**, and tap **OK**. The WebSocket URL normally fills itself in.
3. Steer by tilting the phone; control throttle and brake through the game-provided UIlets. Tap **PIT STOP**: the host replaces the racing controls with tire and refueling controls. Tap **RETURN TO TRACK** to resume.

**Important:** Safari and other mobile browsers require an **HTTPS** page to access physical motion sensors. Localhost HTTP is adequate for inspecting the interface on the same computer, but accessing `http://LAN-IP:8765` from a phone may only provide touch input. For an actual phone, put an HTTPS/WSS-capable proxy or tunnel in front of port 8765 and open its public HTTPS URL. The host demo can remain at localhost. The room code is a shared secret; do not publish it.

**Desktop fallback:** The road demo responds to left/right steering, Up acceleration, Space braking, and P pit-stop even without a phone.

## How UIlets work

The host connects to `/ws?role=host&room=ROOM_CODE`. The phone connects to the same server with `role=controller`. An optional keyboard/GLFW desktop receiver connects with `role=receiver`. The relay can carry all three simultaneously.

The host sends an entire declarative interface snapshot:

```json
{
  "type": "ui.set",
  "regions": {
    "top": [
      {"id": "status", "kind": "text", "text": "READY"}
    ],
    "actions": [
      {"id": "jump", "kind": "button", "label": "Jump"},
      {"id": "throttle", "kind": "slider", "label": "Throttle",
       "min": 0, "max": 100, "step": 5, "value": 40, "unit": "%"},
      {"id": "gear", "kind": "select", "label": "Gear",
       "options": ["Auto", "Manual"], "value": "Auto"}
    ]
  }
}
```

The phone renders the controls and sends semantic events such as:

```json
{"type":"ui.action","id":"throttle","value":65,"phase":"change"}
```

Supported UIlet kinds: `text`, `button`, `toggle`, `slider`, `select`, `meter`, `spacer`. Regions are `top`, `actions`, and `bottom`. Send `{"type":"ui.clear"}` to remove host UIlets.

A host sends descriptions, **not executable HTML or JavaScript**. The browser creates native components, keeps its base gamepad controls available, and never evaluates host code. Only a single host and controller may connect to the relay at once, while multiple desktop receivers are allowed. The latest UI snapshot is retained for reconnecting controllers and cleared when the host disconnects.

The [road demo host implementation](client/demo.js) is a complete working example of how a game integrates. A different host only needs to open a WebSocket, send `ui.set`, and listen for `ui.action`.

## Original GyroRed controls

The 2024 keyboard input format continues to be supported.

| Phone event | Keyboard receiver |
| --- | --- |
| Gravity accelerometer `{x,y,z}` | Smoothed pitch/roll; hold/release arrow keys according to original thresholds |
| `press` / `unpress` | Hold/release Space |
| Tap quadrant 1 / 2 / 3 | A / N / R |
| Swipe up | Tap Space |
| Swipe down / left / right | Hold direction for 80 ms, then N |

For the original desktop OpenGL visualizer and keyboard binding, run the command printed by `relay.py`, for example:

```bash
python gyro_red.py --ws-url 'ws://127.0.0.1:8765/ws?role=receiver&room=YOUR_ROOM_CODE'
```

The phone's accelerometer and gesture messages are forwarded to the host game and any desktop receivers. The UIlet actions go to the host, not to simulated desktop keypresses.

## Project layout

| Path | Responsibility |
| --- | --- |
| `relay.py` | HTTP server, room pairing, WebSocket bridge, UI snapshot |
| `client/index.html`, `client/style.css`, `client/app.js` | Phone interface, sensors, touch controls, UIlet renderer |
| `client/demo.html`, `client/demo.js` | Live desktop road game that pushes UIlets |
| `gyro_red.py` | Reconstructed desktop OpenGL/keyboard adapter |
| `tests/`, `.github/workflows/` | Previously added smoke checks |

## Scope and origin

The source was an eight-page email PDF containing Python code sent by **Bryan Cho on July 15, 2024**. Its extraction had lost indentation, so `gyro_red.py` is a reconstruction rather than an exact transcription. The original look was reconstructed from the `GyroRed_Static.png` screenshot supplied from Google Drive: black background, green crosshairs and 3D wireframe, Connect Phone dialog, Nathan A and Bryan B presets. The old Glitch endpoints visible in those references are *not* dependencies.

This is a compact proof of capability, not a finished commercial gamepad SDK: arbitrary games require an integration with the host protocol, browser motion axes differ by device orientation, and low-latency native HID emulation is outside this browser-based implementation. Live phone hardware behavior has not been verified here.

**Safety:** Desktop keyboard emulation sends keystrokes to whichever desktop application has focus. Test with a harmless window. The relay uses a room secret, but has no rate limiting or user accounts; do not expose it directly on untrusted networks without appropriate proxy restrictions.
