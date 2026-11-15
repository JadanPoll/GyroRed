# GyroRed

Motion-driven keyboard control and live 3D orientation visualization, reconstructed from the Python code sent by **Bryan Cho on July 15, 2024**.

## What it does

A WebSocket connection receives mobile-device orientation, gravity accelerometer readings and gesture events. GyroRed renders an elongated wireframe cuboid in an OpenGL window and translates its tilt and gestures into simulated keyboard input through PyAutoGUI.

| Input | Behavior |
| --- | --- |
| Accelerometer Y | Smoothed Z-axis rotation; tilt activates left/right arrow |
| Accelerometer Z | Smoothed X-axis rotation; tilt activates up/down arrow |
| `press` / `unpress` | Hold / release Space |
| `tap`, quadrant 1 / 2 / 3 | Tap A / N / R |
| `swipe`, up | Tap Space |
| `swipe`, down / left / right | Hold direction for 80 ms, then press N and release |

The original code's smoothing factor (0.06), tilt scales (70° and 60° per 9.5 acceleration units), rectangle dimensions, and directional thresholds are retained. The original read-only yaw update was commented out and is still not applied.

## Install and run

Requires Python 3.10+, a desktop environment with OpenGL/GLFW support, and OS permission for simulated keyboard input.

```bash
python -m pip install -r requirements.txt
python gyro_red.py --ws-url wss://YOUR-RELAY
```

Alternatively set `GYRORED_WS_URL`. **The emailed code used `wss://gem-turquoise-suede.glitch.me` in 2024; this historical endpoint is not verified active.** The relay and phone-side sender are not included in the supplied email.

Example relay messages:

```json
{"gravityaccelerometer":{"x":0,"y":4.0,"z":9.0},"orientation":{"alpha":0,"beta":0,"gamma":0}}
```

```json
{"type":"tap","quadrant":1}
```

```json
{"type":"swipe","direction":"left"}
```

**Warning:** Running this program sends keyboard input to the currently focused application. Test with a safe target window. Use Ctrl+C or close the visualization to stop.

## Provenance and reconstruction

The source was a PDF printout of a Gmail message, not a source file. Its PDF text extraction lost Python indentation. This repository reconstructs blocks and preserves the behavior while applying minimal operational repairs: a main-thread GLFW loop, a separate WebSocket receiver, disconnect handling, and release of held keys on shutdown. It is **not** a byte-for-byte transcription; no hardware/device integration test has been performed.

The original program also imported `orientation` data and computed a yaw delta, but left the yaw assignment commented out; this reconstruction intentionally does not invent yaw behavior.
