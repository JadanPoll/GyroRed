# GyroRed

**Turn an iPad or phone into a gamepad whose buttons and second-screen interface are supplied by the game itself.**

GyroRed revives a 2024 motion-controller experiment. Its main demonstration is deliberately simple: a racing game publishes touch controls to a second browser surface, receives the player's actions, and *replaces the controls* when the player enters a pit stop. The original motion-to-keyboard desktop receiver remains available.

## Start here: Instant Play on an iPad

No account, pairing, BLE hardware, or WebSocket relay is needed. iSH provides a tiny static file server; communication between the two browser surfaces is directly through `BroadcastChannel`.

In iSH, once:

```sh
apk add git python3
git clone https://github.com/JadanPoll/GyroRed.git
cd GyroRed
python3 -m http.server 8765 --bind 127.0.0.1 --directory client
```

If you previously cloned it, use `cd GyroRed && git pull`, then run just the last command.

In Safari, open:

**http://127.0.0.1:8765/play.html**

The game and gamepad appear together. **Tap PIT STOP on the gamepad**, choose a tire or refuel, then **RETURN TO TRACK**. The game switches its UIlets; no controls were hardcoded for that game in the phone app.

- For two distinct Safari windows, open `/demo.html` and `/index.html` on the **same `127.0.0.1:8765` origin**. They pair automatically.
- To enable tilt, tap **Enable motion** in the controller when the browser allows it. Motion is optional for demonstrating UIlets; touch still works without sensors.
- If no controls appear, check the **What's happening? · Diagnostics** panel below the one-page demo. It shows whether both surfaces sent messages and offers **Copy details** for debugging.
- iPadOS may suspend iSH in the background. Once loaded, the browser pages communicate without iSH, but refreshing them requires the server to be running again.

This is a *serverless transport demo*, not a `file://` document: loading the web files initially still requires a static server. Loopback `127.0.0.1` is generally treated as a secure context for browser permissions; sensor support in iPad Safari iframes may vary.

## Other uses

| Mode | Run | When it matters |
| --- | --- | --- |
| **Instant Play** | `python3 -m http.server 8765 --bind 127.0.0.1 --directory client`, then `/play.html` | Two interfaces on one iPad; zero pairing |
| **WebSocket relay** | `pip install aiohttp && python relay.py` | Phone controls a *different device* |
| **Classic desktop receiver** | `pip install -r requirements.txt`; then run the `gyro_red.py` command printed by `relay.py` | OpenGL wireframe and original keyboard mapping |

The networked relay prints a private room code. On the desktop open `http://localhost:8765/demo`, on the phone open the relay's controller URL, and use that code on both. For remote phone tilt, provide an HTTPS/WSS-capable tunnel or proxy to the relay. No legacy Glitch service is required.

## Host ↔ controller protocol

The transport only carries messages. Its gamepad and UIlet semantics are independent of `BroadcastChannel` and WebSockets.

| Host message | Purpose |
| --- | --- |
| `{"type":"ui.set","regions":{"actions":[{"id":"jump","kind":"button","label":"Jump"}]}}` | Push an entire UI layout |
| `{"type":"ui.clear"}` | Remove host controls |
| `{"type":"ui.action","id":"jump","value":true,"phase":"press"}` | Controller sends user action *to host* |
| `{"gravityaccelerometer":{"x":0,"y":4,"z":9}}` | Send motion values (also routed to classic receiver) |

UIlet types: **text, button, toggle, slider, select, meter, spacer**. Regions: **top, actions, bottom**. Host-provided UI descriptions are rendered as ordinary controls; arbitrary host JavaScript/HTML is never executed. The built-in <code>client/demo.js</code> is the reference host implementation.

The 2024 base controls remain: tilt → directional keyboard input, press/unpress → Space, quadrant taps → A/N/R, swipes → Space or direction+N. In Instant Play the legacy controls are inside a disclosure so the game-supplied buttons are immediately visible.

## Structure

| File | Responsibility |
| --- | --- |
| `client/play.html` | First-time demonstration, connection/activity display, diagnostics |
| `client/local.js` | Local same-origin `BroadcastChannel` transport |
| `client/index.html`, `app.js`, `style.css` | Phone controller, motion and UIlet renderer |
| `client/demo.html`, `demo.js` | Driving game and host-side UIlet publisher |
| `relay.py` | Optional WebSocket bridge for separate devices |
| `gyro_red.py` | Original concept's reconstructed desktop input adapter |

## Engineering intent and stopping point

| REM consideration | Decision |
| --- | --- |
| **Holistic goal** | Demonstrate a phone that becomes a host-programmable gamepad and second screen, not build a commercial gaming platform |
| **Canary MVP** | One iPad, one page, one real interactive game, one dynamic pit-stop layout |
| **Useful after a month** | Single entry point, no room code locally, concise diagnostics, copyable errors |
| **Composability** | Game-provided controls and actions are independent of transport |
| **Preserve old foundations** | Original visualizer and keyboard mappings are still present, but don't dominate the demo |
| **Stop economically** | No new native app, elaborate test suite, account system, or always-on infrastructure |

This follows [The Richer Engineering Method](https://github.com/JadanPoll/Learning_Visualizations_Taxonomy/blob/main/Navigationals/The_Richer_Engineering_Method.md): prioritize intent, practical coupling, live-demo awkwardness, failure communication, existing foundations, and realistic stopping points.

**Known boundary:** Safari does not offer native Web Bluetooth. A cross-device BLE/HID mode would require a native iOS adapter and host integration. This is deliberately not part of this archived web prototype. The code has not been verified against physical iPad sensors in this session.

**Origin:** The Python adapter was reconstructed from an eight-page email PDF sent by Bryan Cho on July 15, 2024 (indentation was lost in extraction); the dark/green client recreates a supplied `GyroRed_Static.png` screenshot. It is not an exact copy of the original source.
