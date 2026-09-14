# Official MCP Adapter Update

- Official repository: https://github.com/hisou-tabibituo/social_meadia_mcp.git
- Installed revision: `7647502`.
- New installation: `/Users/mercury/social-media-mcp` using Python 3.12.13 and the official requirements file.
- Preserved the modified previous installation at `/Volumes/SANDISK ELE/tiktok触达系统/social-media-mcp`; no local changes were reset or deleted.
- Updated project `.env.local` Python/adapter paths and the Codex MCP configuration paths. Existing credentials and `https://api.yydsagent.com` were preserved. Credentials are not included here.
- Official adapter exports 14 tools. Actual MCP stdio initialization and tools/list passed. Live polling now uses cloud channel endpoints; no shared local RPA database is required.
- Upstream has no `douyin.stop`. Project restart now calls the existing channel `/stop` endpoint, retaining the session; it does not call unsubscribe.
- Restarted only `mkt-comment-acquisition`, preserving its existing hourly billing plan. Restart returned `ok: true`, `login_state: logged_in`, `display_state: ready`.
- No acquisition task, outbound message or live monitor was started. Other bound Agent desktops were not restarted.
- Dependency consistency check passed. Upstream dependencies emit a Pydantic incomplete-field warning during startup, but handshake and tool discovery succeed.
- Codex must reconnect the MCP server to refresh its tool inventory; editing configuration does not hot-reload existing client sessions.

Verification command:

```sh
/Users/mercury/social-media-mcp/.venv/bin/python scripts/check-installed-douyin-adapter.py
```
