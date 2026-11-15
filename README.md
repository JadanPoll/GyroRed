# GyroRed

A phone-controlled desktop keyboard interface with a live 3D tilt visualizer. Reconstructed from Python code shared by **Bryan Cho on July 15, 2024**, and a screenshot of the original mobile Safari UI (`GyroRed_Static.png`, supplied separately via Google Drive).

## Components

| File | Function |
| --- | --- |
| `client/index.html`, `client/style.css`, `client/app.js` | Mobile controller: green wireframe, crosshairs, connection dialog, motion sensors, gesture controls |
| `relay.py` | Serves the client and relays WebSocket messages between phone and desktop |
| `gyro_red.py` | Desktop OpenGL visualizer; translates sensor events to keyboard events |
| `requirements.txt` | Desktop and relay dependencies |

### Quick start

Python 3.10+; desktop with OpenGL/GLFW and permission for simulated keyboard input.

```bash
python -m pip install -r requirements.txt
python relay.py
```

The relay prints a **random room code** and a ready-to-copy desktop command. In a second terminal on the desktop, run the printed `python gyro_red.py --ws-url 'ws://127.0.0.1:8765/ws?role=receiver&room=...'` command. Leave both terminals running.

Open the controller at `http://localhost:8765/` to inspect the UI on the desktop. For **iPhone/iPad sensors**, the page must be hosted via **HTTPS**: mobile Safari disallows motion access on ordinary LAN HTTP. Forward the relay's HTTP port (8765) using an HTTPS/WebSocket-capable reverse proxy or trusted tunnel, then open its `https://...` URL on your phone. The UI automatically chooses the corresponding `wss://...` WebSocket address.

Tap **Connect Phone**, enter the room code printed by `relay.py`, and tap **OK**. Safari will prompt for motion/orientation access. Keep the page in the foreground and focus a safe desktop text field to test inputs. The historical **Nathan A** and **Bryan B** buttons are retained as profile labels from the screenshot; they do not bypass pairing.

**No hosted relay is included:** the screenshot showed `glowing-oasis-journey.glitch.me` and the 2024 desktop script used `gem-turquoise-suede.glitch.me`. Neither legacy service's availability or protocol is established, so the included relay is the supported integration point.

### Protocol

The browser sends JSON messages to `/ws?role=controller&room=ROOM_CODE`. The desktop uses the same address with `role=receiver`. Only a single controller can connect per relay instance, and a room secret is required on both sides.

| Browser action | Relay message | Desktop result |
| --- | --- | --- |
| Device accelerometer (about 30 Hz) | `{"gravityaccelerometer":{"x":0,"y":4,"z":9}}` | Smooth cuboid tilt and hold/release arrow keys |
| Device orientation (up to 10 Hz) | `{"orientation":{"alpha":0,"beta":0,"gamma":0}}` | Stores orientation; yaw intentionally inactive |
| Hold / release Space | `{"type":"press"}` / `{"type":"unpress"}` | Space down / up |
| Tap Q1 / Q2 / Q3 | `{"type":"tap","quadrant":1}` (2, 3) | A / N / R |
| Swipe up | `{"type":"swipe","direction":"up"}` | Tap Space |
| Swipe down / left / right | `{"type":"swipe","direction":"left"}` | Hold direction for 80 ms, then N |

Original smoothing (0.06), pitch/roll scaling and directional thresholds are preserved.

### Operational notes

- The browser needs motion permission; on iOS, `DeviceMotionEvent.requestPermission()` and `DeviceOrientationEvent.requestPermission()` must be called following a real tap.
- The desktop program sends keys to the **focused application**. Test in a safe text editor, not a terminal with destructive commands.
- A random room code is an access secret; do not publish it. The relay currently has no rate limiting or user accounts. Do not expose it to untrusted networks without an appropriately configured secure proxy and access policy.
- This implementation was source-reviewed and uploaded, but has **not** been exercised against physical iOS sensors or a live remote WebSocket tunnel.

## Provenance

The original emailed Python snippet was extracted from an eight-page PDF that lost indentation. `gyro_red.py` restores its control mapping and wireframe drawing, with explicit keyboard release and reconnection handling. The client is a functional reinterpretation of the **single supplied screenshot**, not a recovery of the original page's hidden source code.
