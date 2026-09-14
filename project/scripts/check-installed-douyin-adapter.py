"""Verify the installed official adapter over stdio without remote actions."""
import asyncio
import json
import os
from pathlib import Path
from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client


async def main():
    root = Path.home() / "social-media-mcp"
    params = StdioServerParameters(
        command=str(root / ".venv/bin/python"),
        args=[str(root / "mcp_data/mcp_adapter.py"), "--channel-server-url", "https://api.yydsagent.com"],
        env={**os.environ, "DOUYIN_API_KEY": ""},
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.list_tools()
            names = sorted(tool.name for tool in result.tools)
            expected = {"douyin.start", "douyin.status", "douyin.open_login", "douyin.start_message_mode", "douyin.start_notification_mode", "douyin.pull_messages", "douyin.pull_notifications", "douyin.start_live_polling", "douyin.pull_live_messages", "douyin.stop_live_polling", "douyin.send_message", "douyin.send_private_message", "douyin.unsubscribe"}
            assert expected.issubset(names), expected.difference(names)
            print(json.dumps({"protocol": "stdio handshake passed", "tools": names}, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
