"""GyroRed standalone HTTP + WebSocket relay.

The relay accepts one controller and one or more desktop receivers per room.
A randomly generated room token is printed at startup; it is never served in
the HTML. Keep it private when exposing the relay through an HTTPS tunnel.
"""
import argparse
import asyncio
import secrets
from pathlib import Path

from aiohttp import WSMsgType, web

ROOT = Path(__file__).parent / "client"


class Rooms:
    def __init__(self, room):
        self.token = room
        self.controllers = set()
        self.receivers = set()

    async def websocket(self, request):
        role = request.query.get("role", "")
        token = request.query.get("room", "")
        if not secrets.compare_digest(token, self.token):
            raise web.HTTPForbidden(text="Invalid room code")
        if role not in ("controller", "receiver"):
            raise web.HTTPBadRequest(text="Invalid role")
        if role == "controller" and self.controllers:
            raise web.HTTPConflict(text="A controller is already connected")
        ws = web.WebSocketResponse(heartbeat=20, max_msg_size=8192)
        await ws.prepare(request)
        peers = self.controllers if role == "controller" else self.receivers
        peers.add(ws)
        await ws.send_json({"type": "connected", "role": role})
        try:
            async for message in ws:
                if message.type == WSMsgType.TEXT and role == "controller":
                    if len(message.data) > 4096:
                        await ws.close(code=1009, message=b"Message too large")
                        break
                    for receiver in tuple(self.receivers):
                        if not receiver.closed:
                            await receiver.send_str(message.data)
                elif message.type == WSMsgType.ERROR:
                    break
        finally:
            peers.discard(ws)
        return ws


def make_app(room):
    state = Rooms(room)
    app = web.Application()
    app.router.add_get("/ws", state.websocket)
    app.router.add_get("/", lambda request: web.FileResponse(ROOT / "index.html"))
    app.router.add_static("/static/", ROOT, show_index=False)
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--room", default=None, help="Shared secret; default: random")
    args = parser.parse_args()
    token = args.room or secrets.token_urlsafe(18)
    print(f"GyroRed controller page: http://localhost:{args.port}/", flush=True)
    print(f"Room code: {token}", flush=True)
    print(
        f"Desktop receiver: python gyro_red.py --ws-url "
        f"'ws://127.0.0.1:{args.port}/ws?role=receiver&room={token}'",
        flush=True,
    )
    print(
        "For iOS, serve this page through an HTTPS endpoint that forwards "
        "WebSocket traffic to this server (e.g. an HTTPS tunnel).",
        flush=True,
    )
    web.run_app(make_app(token), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
