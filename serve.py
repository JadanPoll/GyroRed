"""Serve GyroRed's zero-pairing iPad demo with Python's standard library.

Browser refreshes and iframe navigation may close sockets mid-response. Those
expected disconnects are not server failures and should not print tracebacks.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from sys import exc_info

ROOT = Path(__file__).resolve().parent / "client"
HOST = "127.0.0.1"
PORT = 8765


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # Ordinary 200/304 requests are not actionable; keep genuine HTTP
        # errors visible. The web UI has copyable application diagnostics.
        code = args[1] if len(args) >= 2 and format.startswith('"%s" %s') else None
        try:
            if code is not None and int(code) < 400:
                return
        except (TypeError, ValueError):
            pass
        super().log_message(format, *args)


class Server(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        if isinstance(exc_info()[1], (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)):
            return
        super().handle_error(request, client_address)


def main():
    handler = partial(Handler, directory=str(ROOT))
    with Server((HOST, PORT), handler) as server:
        print("GyroRed ready: http://127.0.0.1:8765/", flush=True)
        print("Open Safari on this iPad; no room code required.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nGyroRed stopped.", flush=True)


if __name__ == "__main__":
    main()
