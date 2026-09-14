# Douyin Data MCP

SaleBuddy 的公开抖音潜客筛选链路通过 Streamable HTTP MCP 接入 `douyin-data-mcp`。

## Configuration

Set the MCP endpoint in `.env.local`:

```bash
BYERING_DOUYIN_DATA_MCP_URL=http://118.196.143.56:8080/mcp
BYERING_DOUYIN_DATA_MCP_TIMEOUT_MS=120000

# OpenAI-compatible intent classifier (the existing Ark/Doubao setup is supported)
BYERING_LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
BYERING_LLM_MODEL=doubao-seed-2-1-pro-260628
BYERING_LLM_API_KEY=<your-key>
```

When this endpoint is configured it takes precedence over the legacy
SpiderApi connector for public prospect discovery. The client negotiates one
MCP session per process and exposes these tools:

- `douyin_get_video_list`
- `douyin_get_comments`
- `douyin_get_task_status`
- `douyin_get_task_result`
- `douyin_create_collection_task`
- `douyin_get_video` (server compatibility alias)

## Discovery request

`POST /v1/connectors/prospect/discover` accepts a public profile URL and
optional bounds:

```json
{
  "taskId": "task-1",
  "taskRunId": "run-1",
  "conversationId": "conversation-1",
  "profileUrl": "https://www.douyin.com/user/<sec_id>",
  "goal": "抓取前三条视频与对应的前50评论",
  "videoLimit": 3,
  "commentLimit": 50
}
```

For the “我的账号作品” path, the URL is also the only account input needed;
the service reads public works and public comments without a cloud desktop
login. Cloud authorization remains reserved for private messages or sending
outreach.

The result is stored in memory for the current backend process. Download the
Excel artifact at `/v1/connectors/prospect/runs/<taskId>.xlsx`; Sheet1 is
`视频信息` and Sheet2 is `评论信息`.

After comments are collected, the service sends the public comment text and
the business goal to the configured model. Each lead receives `high`,
`medium`, or `low`, a 0-100 score, confidence, a user-visible reason, and
observable signals. The snapshot and workbook record `analysis.mode` as
`model` or `heuristic`; if the model is unavailable, the deterministic keyword
scorer is used and the result is explicitly marked as `规则兜底`.

The collector only reads public data. It does not log in, send messages, or
perform any account mutation.
