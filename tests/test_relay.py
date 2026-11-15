"""Representative relay flow: phone -> room-isolated desktop receiver."""
import asyncio
import unittest

from aiohttp import ClientSession, WSServerHandshakeError, web
from aiohttp.test_utils import TestServer

from relay import make_app


class RelayIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.server = TestServer(make_app("test-private-room"))
        await self.server.start_server()
        self.session = ClientSession()
        self.base = str(self.server.make_url("/ws")).replace("http://", "ws://")

    async def asyncTearDown(self):
        await self.session.close()
        await self.server.close()

    async def join(self, role, token="test-private-room"):
        return await self.session.ws_connect(
            self.base, params={"role": role, "room": token}
        )

    async def test_forward_motion_and_release(self):
        async with await self.join("receiver") as receiver:
            async with await self.join("controller") as controller:
                self.assertEqual((await receiver.receive_json())["type"], "connected")
                self.assertEqual((await controller.receive_json())["type"], "connected")
                for payload in (
                    '{"gravityaccelerometer":{"x":0,"y":4,"z":9}}',
                    '{"type":"press"}',
                    '{"type":"unpress"}',
                ):
                    await controller.send_str(payload)
                    event = await asyncio.wait_for(receiver.receive_str(), timeout=2)
                    self.assertEqual(event, payload)

    async def test_reject_wrong_code_and_parallel_controllers(self):
        with self.assertRaises(WSServerHandshakeError):
            await self.join("controller", "incorrect")
        async with await self.join("controller") as first:
            await first.receive_json()
            with self.assertRaises(WSServerHandshakeError) as denied:
                await self.join("controller")
            self.assertEqual(denied.exception.status, 409)

    async def test_receiver_messages_cannot_become_controller_events(self):
        async with await self.join("receiver") as first:
            async with await self.join("receiver") as second:
                await first.receive_json()
                await second.receive_json()
                await first.send_str('{"type":"press"}')
                with self.assertRaises(asyncio.TimeoutError):
                    await asyncio.wait_for(second.receive(), timeout=0.2)


if __name__ == "__main__":
    unittest.main()
