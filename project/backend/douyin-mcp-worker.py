#!/usr/bin/env python3
"""Persistent stdio bridge for the Douyin MCP adapter.

The parent Node process sends one JSON request per line and receives one JSON
response per line. Keeping the MCP client alive is intentional: the adapter
holds the provisioned cloud session in memory between start/login/status calls.
"""
from __future__ import annotations

import argparse
import asyncio
import fcntl
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client


class WorkerAlreadyRunning(RuntimeError):
    """Raised when another local worker owns the same Douyin channel session."""


def worker_lock_path(args: argparse.Namespace) -> Path:
    """Return a stable lock path for one API-key/session channel."""
    identity = "\0".join((
        str(args.channel_server_url or "").strip().rstrip("/"),
        str(os.environ.get("DOUYIN_API_KEY") or "").strip(),
        str(args.session_id or "").strip(),
    ))
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()
    root = Path(os.environ.get("BYERING_DOUYIN_MCP_LOCK_DIR") or (Path(tempfile.gettempdir()) / "byering-douyin-mcp"))
    root.mkdir(parents=True, exist_ok=True)
    return root / f"worker-{digest}.lock"


class WorkerInstanceLock:
    """Keep one MCP worker process per local API-key/session identity."""

    def __init__(self, args: argparse.Namespace):
        self.path = worker_lock_path(args)
        self.handle = None

    def __enter__(self):
        self.handle = self.path.open("a+")
        try:
            fcntl.flock(self.handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            self.handle.close()
            self.handle = None
            raise WorkerAlreadyRunning(
                "another Douyin MCP worker already owns this API key/session; stop the old worker before retrying"
            ) from exc
        return self

    def __exit__(self, exc_type, exc, tb):
        if self.handle is not None:
            fcntl.flock(self.handle.fileno(), fcntl.LOCK_UN)
            self.handle.close()
            self.handle = None


def parse_content(result: Any) -> Any:
    for item in getattr(result, "content", []) or []:
        text = getattr(item, "text", None)
        if not text:
            continue
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"ok": False, "error": {"code": "invalid_mcp_response", "message": text}}
    return {"ok": False, "error": {"code": "empty_mcp_response", "message": "MCP tool returned no content"}}


async def main(args: argparse.Namespace) -> None:
    server_args = [args.adapter, "--channel-server-url", args.channel_server_url]
    # The API key is inherited through DOUYIN_API_KEY so it never appears in
    # the worker or adapter command line.
    if args.session_id:
        server_args.extend(["--session-id", args.session_id])
    # The adapter reads the channel credential from its environment. The MCP
    # stdio client does not reliably inherit the worker environment unless it
    # is passed explicitly, so forward it at this process boundary.
    params = StdioServerParameters(command=sys.executable, args=server_args, env=dict(os.environ))
    with WorkerInstanceLock(args):
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                for raw in sys.stdin:
                    raw = raw.strip()
                    if not raw:
                        continue
                    try:
                        request = json.loads(raw)
                        name = str(request.get("name") or "").strip()
                        arguments = request.get("arguments") or {}
                        if not name:
                            raise ValueError("MCP tool name is required")
                        result = await session.call_tool(name, arguments)
                        response = {"id": request.get("id"), "result": parse_content(result)}
                    except Exception as exc:  # pragma: no cover - exercised through the Node bridge
                        response = {"id": request.get("id") if isinstance(locals().get("request"), dict) else None,
                                    "result": {"ok": False, "error": {"code": "mcp_call_failed", "message": str(exc)}}}
                    sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
                    sys.stdout.flush()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--adapter", required=True)
    parser.add_argument("--channel-server-url", required=True)
    parser.add_argument("--api-key", default="")
    parser.add_argument("--session-id", default="")
    return parser.parse_args()


if __name__ == "__main__":
    try:
        asyncio.run(main(parse_args()))
    except WorkerAlreadyRunning as exc:
        print(f"DOUYIN_MCP_WORKER_ALREADY_RUNNING: {exc}", file=sys.stderr, flush=True)
        raise SystemExit(78)
