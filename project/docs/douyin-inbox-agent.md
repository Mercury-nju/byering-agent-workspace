# Douyin Inbox Agent

`backend/douyin-inbox-agent-service.js` is the production controller for the
inbound private-message agent. It owns a long-lived runtime, durable cursor and
draft state, model reply generation, policy gates, and automatic sending. It does
not discover users or send proactive messages.

## Account-scoped cloud desktop

Each authorized Douyin account owns one cloud session through
`backend/douyin-agent-cloud-registry.js`. The registry persists the remote
`session_id` and the verified account identity in
`~/.byering/douyin-agent-cloud.json` (override with
`BYERING_DOUYIN_AGENT_CLOUD_STATE_FILE`). A normal backend restart recreates the
MCP worker with that saved session and checks its status; it does not provision a
new cloud desktop or call `douyin.unsubscribe`. The login therefore remains in
the account's cloud desktop until Douyin expires it or the user explicitly
reauthorizes it.

If the user leaves the setup page while a cloud desktop is provisioning, the
control plane keeps the provisioning request and its idempotency key on disk;
leaving the page does not call `douyin.unsubscribe`. Returning to the same
account reads the persisted status, shows the startup state again, and resumes
polling until the existing desktop is ready. Duplicate starts for the same
account are coalesced, so a refresh or repeated click cannot create a second
desktop.

The short-lived `view_page_url` returned by `douyin.open_login` is only a
browser viewer link. Its countdown is independent from the persisted cloud
session and login state. A viewer can show `连接已关闭` before that link
expires when its WebSocket is interrupted or another viewer connects to the
same desktop. The authorization UI releases the previous embedded viewer
before opening a new one and can request a fresh viewer link without
recreating the account's cloud session.

The setup flow gives the user an explicit choice when leaving during startup.
Choosing to leave writes the resumable configuration to browser storage and
posts a progress message into that Agent's member conversation. The member
conversation polls the real MCP status; once the desktop is ready it adds a
continue action and posts a ready message. Continuing opens the same Agent
flow with the saved configuration instead of asking the user to start over.

## Agent conversation as the activity inbox

The Agent's member conversation is the durable activity entry point for the
workflow. Cloud startup, login readiness, authorization, inbox runtime
progress, newly received messages, generated drafts, approved sends, stop
events, and errors are written as Agent-authored messages. The activity feed is
subscribed to the shared work-live source and stays active outside Agent
Square, so leaving the setup page does not make the workflow appear idle. The
message stream is idempotent per work-event sequence and is stored by the
existing DM gateway; reopening Members reconstructs the same timeline.
When the backend inbox runtime continues after the setup page closes, an
application-level monitor resumes its event cursor and mirrors new inbox
events into the same conversation. It does not replay the existing event
history on first attach.
Cloud readiness is monitored at the same application level, so the ready
message is written to the conversation even if the user is on another page.

The inbox runtime has a separate durable state file per Agent under
`~/.byering/douyin-inbox/<agentId>.json`. This keeps the message cursor,
deduplication ids, conversations, drafts, and send results isolated as well.

## Runtime contract

```js
import { createDouyinMcpService } from "../backend/douyin-mcp.js";
import { createDouyinInboxAgentService } from "../backend/douyin-inbox-agent-service.js";

const mcp = createDouyinMcpService();
const service = createDouyinInboxAgentService({ douyinMcpService: mcp });
await service.start({
  autoReply: true,
  replyRule: "先回答问题；价格、承诺和不确定事项转人工。",
  startPolling: true
});
```

The product entry always starts the inbox Agent with `autoReply: true`; there is
no user-facing draft or manual-confirm mode. The model is called through the
configured OpenAI-compatible endpoint; if no model key is configured, startup
fails instead of returning a canned reply. Policy-flagged messages stop before
sending and enter the human-handoff queue with their full context. Every
automatic send uses a deterministic request id (`douyin-inbox:<messageId>`).

## Control-plane flow

1. Authorize the Douyin account through `/v1/douyin/mcp/start` and
   `/v1/douyin/mcp/open-login`, passing `agentId` (the marketplace inbox Agent
   uses `mkt-dm-inbox`). A later status request with the same `agentId` resumes
   the saved cloud session.
2. `POST /v1/douyin/inbox-agent/start` verifies authorization and model
   configuration, then starts `douyin.start_message_mode` and a long-running
   pull loop.
3. Each cycle calls `douyin.pull_messages` with the persisted cursor. Inbound
   messages are normalized, deduplicated, and outbound messages are ignored.
4. The policy gate either skips the message, requests a model reply, or routes
   the conversation to human handoff.
5. The Agent sends automatically only when policy allows it.
6. Human-handoff conversations remain stopped unless an operator explicitly
   chooses an action from the runtime record.
7. Cursor, deduplication ids, drafts, and send results are written to the
   durable state file before the next cycle.

The inbox agent never calls `douyin.send_private_message`; that method remains
owned by the proactive private-outreach agent.

## Reply strategy

Reply content is controlled by `backend/douyin-reply-strategy.js`, not by an
unbounded chat prompt. The strategy first classifies intent (`greeting`,
`product_question`, `price_question`, `purchase_intent`, `complaint`,
`opt_out`, or `unclear`) and tracks the conversation stage. It then selects an
action (`welcome`, `answer`, `qualify`, `handoff`, `stop`, or `clarify`). The
model only writes the final wording from that plan and the configured business
knowledge. A validator rejects meta-disclosure, unsupported promises, and
replies that violate the stop boundary.

The setup screen therefore asks only for the business objective, approved
business knowledge, reply tone, operating rules, and human-handoff boundaries.
Reply mode is not configurable: the Agent performs automatic intake, while
missing knowledge or policy boundaries fail closed into human handoff.

The MCP service still reads `BYERING_DOUYIN_MCP_API_KEY` from the environment.
Do not put the API key in source, fixtures, or logs. The local adapter and
Python executable are configured with `BYERING_DOUYIN_MCP_ADAPTER` and
`BYERING_DOUYIN_MCP_PYTHON` when the defaults do not apply.

Provider session isolation

The channel provider allows one active cloud session per API Key. A separate
MCP worker process does not create a separate cloud desktop when it uses the
same key. Configure a scoped key for every Agent that needs its own desktop;
the Agent id is upper-cased and non-alphanumeric characters become `_`:

```dotenv
BYERING_DOUYIN_MCP_API_KEY_MKT_DM_INBOX=byk_inbox_...
BYERING_DOUYIN_MCP_API_KEY_MKT_COLD_WRITER=byk_outreach_...
```

Scoped keys override `BYERING_DOUYIN_MCP_API_KEY`. If two persisted Agents are
still bound to the same key or session, the control plane returns a conflict
instead of silently sharing a desktop. After adding scoped keys, restart the
backend once so it creates the workers with the new credentials. The setup
screen exposes “重启云电脑” when a provider stays in `starting` beyond the
provisioning deadline; this calls `douyin.stop` first and preserves login state.

## Events

The runtime emits `agent.started`, `message.received`, `message.skipped`,
`reply.drafted`, `reply.sent`, `reply.skipped`, `reply.error`,
`poll.completed`, `poll.error`, and `agent.stopped`. Persist the returned
state through the `stateStore` interface for restart-safe cursors and
deduplication.
