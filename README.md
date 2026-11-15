# GyroRed

**Turn a phone or tablet into a gamepad with controls supplied dynamically by the game.**

A revived motion-controller experiment with one concrete demonstration: a racing game sends its UI to a controller, then replaces the controls with tire and fuel options during a pit stop.

## Play on iPad (recommended)

From iSH, in an existing clone:

```sh
cd GyroRed
git pull
python3 serve.py
```

If you haven't cloned the repository yet:

```sh
apk add git python3
git clone https://github.com/JadanPoll/GyroRed.git
cd GyroRed
python3 serve.py
```

Then open **http://127.0.0.1:8765/** in Safari. If an old server is still running in iSH, stop it first with **Ctrl+C**, then start this one.

That's it. **There is no room code or pairing step in this mode.** The page opens the racing game and controller together. Tap **PIT STOP** in the controller, change tires or fuel, and tap **RETURN TO TRACK**. The game changes the UI and responds to your choices. Touch works without sensor permission.

The game and controller exchange messages over `BroadcastChannel`, a same-origin browser feature. `serve.py` uses Python's built-in HTTP server and quietly ignores ordinary Safari socket closures (such as `BrokenPipeError` from abandoned requests). iSH is needed only to serve the static pages when opening or refreshing. If nothing happens, open **What's happening? · Diagnostics** and use **Copy details**.

## Connecting to a separate computer (optional)

This is a *different* workflow, and the **only one that requires a connection code**.

On a computer with Python and `aiohttp`:

```sh
pip install aiohttp
python relay.py
```

The terminal prints **Separate-device connection code**. Open `/demo.html?local=0` on the game computer and `/index.html?local=0` on the phone, using the relay's reachable address. Paste the displayed connection code in both. The relay must be reachable from the phone; iOS motion sensors generally require HTTPS/WSS, not ordinary LAN HTTP.

To use the classic Python/OpenGL keyboard receiver, install `requirements.txt` and run the `gyro_red.py` command printed by the relay. The old key mappings are preserved behind the controller's **Original controls** disclosure in Instant Play.

## Under the hood

| Component | Purpose |
| --- | --- |
| `client/play.html` | One-page game-and-gamepad demonstration, status and diagnostics |
| `serve.py` | Tiny stdlib iSH server; avoids misleading Safari-disconnect tracebacks |
| `client/index.html`, `app.js`, `style.css` | Dynamic controller UI, touch input, optional motion sensors |
| `client/demo.html`, `demo.js` | Game host that publishes controls and consumes actions |
| `client/local.js` | Same-device `BroadcastChannel` transport |
| `relay.py` | Optional WebSocket transport for separate devices |
| `gyro_red.py` | Reconstructed 2024 desktop keyboard/OpenGL adapter |

Game-to-controller messages use a small declarative protocol. For example:

```json
{"type":"ui.set","regions":{"actions":[{"id":"pit","kind":"button","label":"PIT STOP"}]}}
```

A tap produces:

```json
{"type":"ui.action","id":"pit","value":true,"phase":"press"}
```

Supported controls: button, text, toggle, slider, select, meter and spacer. Game-provided HTML or JavaScript is never executed by the controller. See `client/demo.js` for the complete host example.

## Scope

The goal is a memorable, usable demonstration, **not** an always-running service, complex pairing system, BLE stack, or commercial gamepad SDK. The local demonstration does not require Bluetooth, a separate device, user accounts or cloud hosting. Cross-device BLE/HID is outside the current scope.

The original program came from Python code shared by Bryan Cho on July 15, 2024, reconstructed from an email PDF; the black-and-green mobile appearance was recreated from a supplied screenshot. The implementation is not a byte-for-byte recovery. Live iPad sensor behavior has not been verified.

Engineering priorities follow [The Richer Engineering Method](https://github.com/JadanPoll/Learning_Visualizations_Taxonomy/blob/main/Navigationals/The_Richer_Engineering_Method.md): preserve useful foundations, minimize friction, support cold demonstrations and sensible stopping points.
