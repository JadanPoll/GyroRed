"""GyroRed relay: one phone, desktop receivers, and one UIlet host per room."""
import argparse
import asyncio
import json
import secrets
from pathlib import Path

from aiohttp import WSMsgType, web

ROOT = Path(__file__).parent / "client"
UI_KINDS = {"text", "button", "toggle", "slider", "select", "meter", "spacer"}
UI_REGIONS = {"top", "actions", "bottom"}


class Rooms:
    def __init__(self, room):
        self.token = room
        self.controllers = set()
        self.receivers = set()
        self.hosts = set()
        self.last_ui = {"type": "ui.set", "regions": {}}

    async def broadcast(self, peers, payload):
        for socket in tuple(peers):
            if not socket.closed:
                try:
                    await socket.send_str(payload)
                except ConnectionError:
                    pass

    @staticmethod
    def valid_ui(data):
        if data.get("type") == "ui.clear":
            return True
        if data.get("type") != "ui.set":
            return False
        regions = data.get("regions")
        if not isinstance(regions, dict) or set(regions) - UI_REGIONS:
            return False
        ids = set()
        count = 0
        for controls in regions.values():
            if not isinstance(controls, list):
                return False
            count += len(controls)
            if count > 40:
                return False
            for item in controls:
                if not isinstance(item, dict):
                    return False
                name, kind = item.get("id"), item.get("kind")
                if not isinstance(name, str) or not (1 <= len(name) <= 64):
                    return False
                if name in ids or kind not in UI_KINDS:
                    return False
                ids.add(name)
        return True

    async def websocket(self, request):
        role = request.query.get("role", "")
        token = request.query.get("room", "")
        if not secrets.compare_digest(token, self.token):
            raise web.HTTPForbidden(text="Invalid room code")
        if role not in ("controller", "receiver", "host"):
            raise web.HTTPBadRequest(text="Invalid role")
        if role == "controller" and self.controllers:
            raise web.HTTPConflict(text="A controller is already connected")
        if role == "host" and self.hosts:
            raise web.HTTPConflict(text="A host is already connected")

        socket = web.WebSocketResponse(heartbeat=20, max_msg_size=16384)
        await socket.prepare(request)
        peers = {"controller": self.controllers, "receiver": self.receivers, "host": self.hosts}[role]
        peers.add(socket)
        await socket.send_json({"type": "connected", "role": role})
        if role == "controller":
            await socket.send_json(self.last_ui)

        try:
            async for message in socket:
                if message.type != WSMsgType.TEXT:
                    if message.type == WSMsgType.ERROR:
                        break
                    continue
                if len(message.data) > 12000:
                    await socket.close(code=1009, message=b"Message too large")
                    break
                try:
                    data = json.loads(message.data)
                except (ValueError, TypeError):
                    continue
                if not isinstance(data, dict):
                    continue
                kind = data.get("type", "")
                if role == "controller":
                    if kind == "ui.action":
                        await self.broadcast(self.hosts, message.data)
                    elif kind not in ("ui.set", "ui.clear", "connected"):
                        await self.broadcast(self.receivers | self.hosts, message.data)
                elif role == "host" and kind in ("ui.set", "ui.clear"):
                    if self.valid_ui(data):
                        self.last_ui = data if kind == "ui.set" else {"type": "ui.set", "regions": {}}
                        await self.broadcast(self.controllers, json.dumps(self.last_ui))
        finally:
            peers.discard(socket)
            if role == "host":
                self.last_ui = {"type": "ui.set", "regions": {}}
                await self.broadcast(self.controllers, json.dumps(self.last_ui))
        return socket


def make_app(room):
    state = Rooms(room)
    app = web.Application()
    app.router.add_get("/ws", state.websocket)
    app.router.add_get("/", lambda request: web.FileResponse(ROOT / "index.html"))
    app.router.add_get("/demo", lambda request: web.FileResponse(ROOT / "demo.html"))
    app.router.add_get("/play", lambda request: web.FileResponse(ROOT / "play.html"))
    app.router.add_static("/static/", ROOT, show_index=False)
    # These root-relative resources also let standalone pages share the
    # same markup as python3 -m http.server -d client.
    for name in ("style.css", "app.js", "demo.js", "local.js"):
        app.router.add_get("/" + name, lambda request, filename=name: web.FileResponse(ROOT / filename))
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--room", help="Shared secret; default: random")
    args = parser.parse_args()
    token = args.room or secrets.token_urlsafe(18)
    print(f"Controller page: http://localhost:{args.port}/", flush=True)
    print(f"Room code: {token}", flush=True)
    print(f"Desktop receiver: python gyro_red.py --ws-url "
          f"'ws://127.0.0.1:{args.port}/ws?role=receiver&room={token}'", flush=True)
    print(f"Interactive UIlet host: http://localhost:{args.port}/demo", flush=True)
    print("iPhone/iPad sensors require an HTTPS/WSS reverse proxy or tunnel.", flush=True)
    web.run_app(make_app(token), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
