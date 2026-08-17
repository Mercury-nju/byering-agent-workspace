# Recovered Gateway Protocol

This contract is inferred from the packaged renderer bundle. It is an observed contract, not a claim that the original backend source has been recovered.

## Connection

- Renderer opens `ws://127.0.0.1:<gateway-port>`.
- The query string carries `token=<url-encoded-token>`.
- The client configuration uses the WebSocket subprotocol label `ws-ag-ui`.
- The default namespace is `/agent`.
- The client reconnects with exponential backoff from 1 second to 30 seconds.

## Request envelope

```json
{
  "event": "gateway.action",
  "requestId": "1",
  "payload": {
    "action": "skill.action.list"
  }
}
```

`agent.action`, `agent.run`, `agent.cancel`, and `agent.warmup` use the same envelope with a different `event` value.

## Response envelope

Request acknowledgements are correlated by `requestId`:

```json
{
  "type": "ack",
  "requestId": "1",
  "data": {
    "code": 0,
    "data": []
  }
}
```

Unmatched failures use `{ "type": "error", "event": "...", "message": "..." }`.

Observed gateway events include `gateway.connected`, `gateway.tick`, `gateway.agent_connect_status_change`, and `gateway.switch_changed`.

## Observed action families

The renderer invokes the actions listed in `../recovered-symbols/gateway-actions.txt`. The most concrete payloads recovered from call sites are:

| Action | Observed payload | Observed response assumptions |
| --- | --- | --- |
| `skill.action.list` | none | `code === 0`, `data` is an array |
| `skill.action.install` | `{ "id": <skill-id> }` | `code === 0`, `data` is installed skill |
| `skill.action.update` | `{ "id": <skill-id> }` | `code === 0`, `data` is updated skill |
| `skill.action.delete` | `{ "id": <id> }` or `{ "skillName": "..." }` | `code === 0` |
| `skill.action.localInstall` | `{ "skillPaths": [] }` | `code === 0`, `data` is an array |
| `message.action.list` | `{ "type?": "...", "read_status?": ..., "page": 1, "page_size": 20 }` | paged `data.list`, `total`, `page`, `page_size`, `has_more` |
| `message.action.get` | `{ "id": <id> }` | `code === 0`, `data` is a message |
| `message.action.read` | `{ "id": <id> }` or `{ "ids": [] }` | `code === 0` |
| `message.action.delete` | `{ "id": <id> }` or `{ "ids": [] }` | `code === 0` |
| `schedule.action.list` | none | `code === 0`, `data` is an array |
| `schedule.action.create` | caller-supplied task object | `data.task_id` |
| `schedule.action.update` | caller-supplied task object | `data.task_id` |
| `schedule.action.delete` | `{ "task_id": <number> }` | `code === 0` |
| `schedule.action.exec` | `{ "task_id": <number> }` | `data.result.conversation_id` |
| `schedule.action.read` | `{ "task_id": <number> }` | `data.read_count` |
| `weixin.getStatus` | none | `status`, `accountId`, `conversationIds`, `cooldownUntil` |
| `weixin.getQrcode` | none | `success`, `qrcodeUrl`, `qrcodeKey` |
| `weixin.unbind` | none | `success` |
| `weixin.releaseQrcode` | none | `success` |
| `location.action.query` | none | location result is returned directly |
| `switch.action.get` | none | `code === 0`, `data.luckin_ordering_switch` is read |

