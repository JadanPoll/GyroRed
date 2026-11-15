"""GyroRed: motion-driven keyboard control with a 3D orientation display.

Reconstructed from the Python program shared by Bryan Cho on July 15, 2024.
Requires a WebSocket relay that sends the message schema documented in README.md.
"""
import argparse
import asyncio
import json
import os
import threading
import time

import glfw
import numpy as np
import pyautogui
import websockets
from OpenGL.GL import (
    GL_COLOR_BUFFER_BIT, GL_LINES, GL_MODELVIEW, GL_PROJECTION,
    glBegin, glClear, glEnd, glLoadIdentity, glMatrixMode, glRotatef,
    glTranslatef, glVertex3fv, glViewport,
)
from OpenGL.GLU import gluPerspective

# Original settings from the emailed program.
SMOOTHING_FACTOR = 0.06
WIDTH, HEIGHT, DEPTH = 2.5, 1.0, 0.5
VERTICES = np.array([
    [-WIDTH / 2, -HEIGHT / 2, -DEPTH / 2],
    [ WIDTH / 2, -HEIGHT / 2, -DEPTH / 2],
    [ WIDTH / 2,  HEIGHT / 2, -DEPTH / 2],
    [-WIDTH / 2,  HEIGHT / 2, -DEPTH / 2],
    [-WIDTH / 2, -HEIGHT / 2,  DEPTH / 2],
    [ WIDTH / 2, -HEIGHT / 2,  DEPTH / 2],
    [ WIDTH / 2,  HEIGHT / 2,  DEPTH / 2],
    [-WIDTH / 2,  HEIGHT / 2,  DEPTH / 2],
])
EDGES = np.array([
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
], dtype=np.uint8)


class Keyboard:
    """Track held keys to avoid repeating down events and sticking on exit."""

    def __init__(self):
        self.pressed = set()
        self.lock = threading.RLock()

    def hold(self, key, down):
        with self.lock:
            if down and key not in self.pressed:
                pyautogui.keyDown(key)
                self.pressed.add(key)
            elif not down and key in self.pressed:
                pyautogui.keyUp(key)
                self.pressed.remove(key)

    def tap(self, key):
        with self.lock:
            pyautogui.press(key)

    def release_all(self):
        with self.lock:
            for key in tuple(self.pressed):
                pyautogui.keyUp(key)
                self.pressed.discard(key)


class GyroRed:
    def __init__(self):
        self.orientation = {"alpha": None, "beta": None, "gamma": None}
        self.accelerometer = {"x": None, "y": None, "z": None}
        self.rotation = [0.0, 0.0, 0.0]
        self.lock = threading.RLock()
        self.keyboard = Keyboard()
        self.running = True

    def handle_message(self, message):
        data = json.loads(message)
        if not isinstance(data, dict):
            return
        with self.lock:
            if isinstance(data.get("orientation"), dict):
                self.orientation.update({
                    k: data["orientation"][k]
                    for k in ("alpha", "beta", "gamma")
                    if k in data["orientation"]
                })
            if isinstance(data.get("gravityaccelerometer"), dict):
                self.accelerometer.update({
                    k: data["gravityaccelerometer"][k]
                    for k in ("x", "y", "z")
                    if k in data["gravityaccelerometer"]
                })

        event = data.get("type")
        if event == "press":
            self.keyboard.hold("space", True)
        elif event == "unpress":
            self.keyboard.hold("space", False)
        elif event == "tap":
            keys = {1: "a", 2: "n", 3: "r"}
            try:
                key = keys.get(int(data.get("quadrant")))
            except (TypeError, ValueError):
                key = None
            if key:
                self.keyboard.tap(key)
        elif event == "swipe":
            self.keyboard.hold("space", False)
            direction = data.get("direction")
            if direction == "up":
                self.keyboard.tap("space")
            elif direction in ("down", "left", "right"):
                # The original code holds direction for 80 ms, then sends "n".
                # Execute sequentially to avoid races between release events.
                self.keyboard.hold(direction, True)
                time.sleep(0.08)
                self.keyboard.hold("n", True)
                self.keyboard.hold(direction, False)
                self.keyboard.hold("n", False)

    @staticmethod
    def smooth(current, target):
        delta = (target - current + 180.0) % 360.0 - 180.0
        return current + delta * SMOOTHING_FACTOR

    def update_rotation(self):
        with self.lock:
            ay = self.accelerometer.get("y")
            az = self.accelerometer.get("z")
        try:
            if ay is not None:
                self.rotation[2] = self.smooth(
                    self.rotation[2], (float(ay) / 9.5) * 70
                )
            if az is not None:
                self.rotation[0] = self.smooth(
                    self.rotation[0], -(float(az) / 9.5) * 60
                )
        except (TypeError, ValueError):
            return

    def update_direction_keys(self):
        x, _, z = self.rotation
        # Original source thresholds, including the asymmetric down range.
        self.keyboard.hold("down", -80 <= x <= 5)
        self.keyboard.hold("up", 35 <= x <= 80)
        self.keyboard.hold("right", -75 <= z <= -20)
        self.keyboard.hold("left", 20 <= z <= 75)

    async def receive(self, url):
        while self.running:
            try:
                async with websockets.connect(url) as socket:
                    print(f"Connected to {url}")
                    async for message in socket:
                        if not self.running:
                            break
                        try:
                            await asyncio.to_thread(self.handle_message, message)
                        except (ValueError, TypeError, KeyError) as error:
                            print(f"Invalid message: {error}")
            except (OSError, websockets.exceptions.WebSocketException) as error:
                if self.running:
                    print(f"WebSocket disconnected: {error}; retrying")
                    await asyncio.sleep(2)
            finally:
                self.keyboard.release_all()

    def render(self):
        if not glfw.init():
            raise RuntimeError("Failed to initialize GLFW")
        window = glfw.create_window(800, 600, "GyroRed", None, None)
        if not window:
            glfw.terminate()
            raise RuntimeError("Failed to create GLFW window")
        try:
            glfw.make_context_current(window)
            glViewport(0, 0, 800, 600)
            glMatrixMode(GL_PROJECTION)
            glLoadIdentity()
            gluPerspective(45, 800 / 600, 0.1, 100.0)
            glMatrixMode(GL_MODELVIEW)

            while not glfw.window_should_close(window):
                glfw.poll_events()
                self.update_rotation()
                self.update_direction_keys()
                glClear(GL_COLOR_BUFFER_BIT)
                glLoadIdentity()
                glTranslatef(0, 0, -5)
                glRotatef(self.rotation[0], -1, 0, 0)
                glRotatef(self.rotation[1], 0, -1, 0)
                glRotatef(self.rotation[2], 0, 0, 1)
                glBegin(GL_LINES)
                for edge in EDGES:
                    for vertex in edge:
                        glVertex3fv(VERTICES[vertex])
                glEnd()
                glfw.swap_buffers(window)
        finally:
            self.running = False
            self.keyboard.release_all()
            glfw.destroy_window(window)
            glfw.terminate()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--ws-url",
        default=os.environ.get("GYRORED_WS_URL"),
        help="WebSocket relay URL; alternatively set GYRORED_WS_URL",
    )
    args = parser.parse_args()
    if not args.ws_url:
        parser.error("Provide --ws-url or GYRORED_WS_URL")

    app = GyroRed()
    # GLFW runs on the main thread; networking runs in a worker thread.
    network = threading.Thread(
        target=lambda: asyncio.run(app.receive(args.ws_url)), daemon=True
    )
    network.start()
    try:
        app.render()
    finally:
        app.running = False
        app.keyboard.release_all()


if __name__ == "__main__":
    main()
