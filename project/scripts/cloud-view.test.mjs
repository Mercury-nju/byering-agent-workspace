import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runInNewContext } from "node:vm";

const html = fs.readFileSync(new URL("../cloud-view.html", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../src/salebuddy/ui/cloud-view.js", import.meta.url), "utf8");

test("embedded viewers hide the internal toolbar before first paint and retain an error recovery action", () => {
  assert.match(html, /document\.documentElement\.dataset\.embedded/);
  assert.match(html, /html\[data-embedded="1"\] header\s*\{\s*display:\s*none/);
  assert.ok(html.indexOf("dataset.embedded") < html.indexOf("<body>"));
  assert.match(html, /id="message-reconnect"[^>]*hidden/);
  assert.match(html, /#message-reconnect\s*\{[^}]*pointer-events:\s*auto/);
  assert.match(source, /messageReconnectButton\.addEventListener\("click", reconnect\)/);
  assert.match(source, /reconnectButton\.addEventListener\("click", reconnect\)/);
  assert.match(source, /messageReconnectButton\.hidden = !embedded \|\| !retry/);
});

test("embedded retry calls the existing reconnect flow once and restores both controls", async () => {
  const start = source.indexOf("async function reconnect()"), end = source.indexOf('reconnectButton.addEventListener("click", reconnect)', start);
  const calls = [], reconnectButton = { disabled: false }, messageReconnectButton = { disabled: false };
  let finish;
  const connectWait = new Promise(resolve => { finish = resolve; });
  const reconnect = runInNewContext(source.slice(start, end) + "\nreconnect", {
    reconnectButton, messageReconnectButton, stopped: false, reconnectTimer: null,
    reconnectAttempt: 2, intentionalDisconnect: true, targetUrl: "", isExpired: () => true,
    fetchFreshTarget: async options => { calls.push(["credential", options.userInitiated]); },
    connect: async () => { calls.push(["connect"]); await connectWait; },
    clearTimeout() {}, showConnectionError: () => assert.fail("Unexpected connection failure")
  });
  const first = reconnect(); await Promise.resolve();
  await reconnect();
  assert.equal(reconnectButton.disabled, true); assert.equal(messageReconnectButton.disabled, true);
  finish(); await first;
  assert.deepEqual(calls, [["credential", true], ["connect"]]);
  assert.equal(reconnectButton.disabled, false); assert.equal(messageReconnectButton.disabled, false);
});

test("a loading message hides the embedded retry action but a connection error exposes it", () => {
  const start = source.indexOf("function showMessage("), end = source.indexOf("function hideMessage", start);
  const message = { hidden: true }, button = { hidden: true };
  const show = runInNewContext(source.slice(start, end) + "\nshowMessage", { message, messageTitle: {}, messageCopy: {}, messageReconnectButton: button, embedded: true });
  show("Connecting", "", { retry: false }); assert.equal(button.hidden, true);
  show("Disconnected", ""); assert.equal(button.hidden, false);
});

test("local cloud viewer owns the VNC connection and reuses the same Agent session", () => {
  assert.match(html, /src=["']\.\/src\/salebuddy\/ui\/cloud-view\.js["']/);
  assert.match(source, /new RFB/);
  assert.match(source, /scheduleReconnect/);
  assert.match(source, /v1\/douyin\/mcp\/view-link/);
  assert.match(source, /agentId/);
  assert.match(source, /viewPageUrl/);
  assert.match(source, /decodeViewPage/);
  assert.match(source, /refreshedExpiry/);
});

test("initial cloud viewer connection refreshes the Agent view link instead of restoring a browser-stored VNC ticket", async () => {
  assert.doesNotMatch(source, /sessionStorage/);
  const start = source.indexOf("async function freshTarget");
  const end = source.indexOf("function clearScreen", start);
  const refreshCalls = [];
  const freshTarget = runInNewContext(source.slice(start, end) + "\nfreshTarget", {
    refreshPromise: null,
    targetUrl: "",
    isExpired: () => false,
    fetchCachedTarget: async (options = {}) => {
      refreshCalls.push(options.refresh);
      return "wss://fresh.example/view";
    }
  });

  assert.equal(await freshTarget(), "wss://fresh.example/view");
  assert.deepEqual(refreshCalls, [true]);
});

test("local cloud viewer uses the provider VNC subprotocol and does not wait forever for a handshake", () => {
  assert.match(source, /const VNC_WS_PROTOCOLS = Object\.freeze\(\["binary"\]\)/);
  assert.match(source, /new RFB\(screen, url, \{ wsProtocols: VNC_WS_PROTOCOLS \}\)/);
  assert.match(source, /next\.showDotCursor = true/);
  assert.match(source, /const CONNECTION_TIMEOUT_MS = 20_000/);
  assert.match(source, /function scheduleConnectionTimeout\(next\)/);
  assert.match(source, /scheduleConnectionTimeout\(next\)/);
});

test("embedded cloud viewer can replay its current state after the parent misses an event", () => {
  assert.match(source, /let viewerState = "connecting"/);
  assert.match(source, /byering-cloud-viewer-status-request/);
  assert.match(source, /function replyWithCurrentState\(\)/);
});

test("automatic cloud viewer recovery refreshes only the existing session view link", () => {
  assert.match(source, /fetchFreshTarget\(\{ userInitiated = false \} = \{\}\)/);
  assert.match(source, /if \(!userInitiated\)/);
  const reconnectBody = source.slice(source.indexOf("function scheduleReconnect"), source.indexOf("async function connect"));
  assert.match(reconnectBody, /fetchCachedTarget\(\{ refresh: true \}\)/);
  assert.doesNotMatch(reconnectBody, /fetchFreshTarget/);
});

test("automatic cloud viewer recovery refreshes a stale VNC link before reconnecting", async () => {
  const start = source.indexOf("function scheduleReconnect");
  const end = source.indexOf("async function connect", start);
  const calls = [];
  let scheduled;
  const scheduleReconnect = runInNewContext(source.slice(start, end) + "\nscheduleReconnect", {
    stopped: false,
    intentionalDisconnect: false,
    reconnectTimer: null,
    reconnectAttempt: 0,
    targetUrl: "wss://cached.example/view",
    isExpired: () => false,
    clearCredentialRenewalTimer() {},
    setStatus() {},
    notifyParent() {},
    showMessage() {},
    fetchCachedTarget: async (options) => { calls.push(["refresh", options.refresh]); },
    connect: async () => { calls.push(["connect"]); },
    setTimeout(callback) { scheduled = callback; return 1; },
    clearTimeout() {}
  });

  scheduleReconnect("VNC proxy closed");
  await scheduled();

  assert.deepEqual(calls, [["refresh", true], ["connect"]]);
});

test("local cloud viewer renews expiring screen credentials before the provider disconnects it", () => {
  assert.match(source, /CREDENTIAL_RENEWAL_LEAD_MS/);
  assert.match(source, /function scheduleCredentialRenewal/);
  const renewalBody = source.slice(source.indexOf("async function renewCredentialsAndReconnect"), source.indexOf("function scheduleCredentialRenewal"));
  assert.match(renewalBody, /fetchCachedTarget\(\{ refresh: true \}\)/);
  assert.doesNotMatch(renewalBody, /fetchFreshTarget/);
  assert.match(source, /credentialRenewalTimer = globalThis\.setTimeout/);
  assert.match(source, /await connect\(\);/);
});

test("credential renewal keeps one viewer connection by closing the old client inside connect", () => {
  const connectBody = source.slice(source.indexOf("async function connect"), source.indexOf("disconnectButton.addEventListener"));
  assert.match(connectBody, /closeClient\(\);[\s\S]*?new RFB/);
  assert.doesNotMatch(source, /window\.open/);
});

test("local cloud viewer does not release the Agent session while repairing a screen link", () => {
  assert.match(source, /disconnect\(\)/);
  assert.doesNotMatch(source, /unsubscribe/);
  assert.doesNotMatch(source, /douyin\.stop/);
});

test("local cloud viewer treats missing credentials as a terminal viewer error", () => {
  const credentialsHandler = source.indexOf('"credentialsrequired"');
  const handlerBody = source.slice(credentialsHandler, source.indexOf('});', credentialsHandler) + 3);
  assert.match(handlerBody, /terminalViewerError = true/);
  assert.match(handlerBody, /intentionalDisconnect = true/);
  assert.match(handlerBody, /缺少画面凭据/);
});

test("local cloud viewer reports real connection state to its embedding page", () => {
  assert.match(source, /function notifyParent/);
  assert.match(source, /postMessage\?\.\(\{/);
  assert.ok(source.includes('notifyParent("connecting"'));
  assert.ok(source.includes('notifyParent("connected"'));
  assert.ok(source.includes('notifyParent("reconnecting"'));
  assert.ok(source.includes('notifyParent("error"'));
  assert.ok(source.includes('notifyParent("disconnected"'));
  assert.equal(html.includes('main { position: relative; flex: 1; min-height: 0; overflow: hidden; background: #000; }'), false);
});

test("embedded viewers return only an actual rendered JPEG frame when the parent requests it", () => {
  assert.match(source, /byering-cloud-viewer-capture/);
  assert.match(source, /byering-cloud-snapshot/);
  assert.match(source, /resolveStableLiveRoomCaptureRegion/);
  assert.match(source, /resolveStableLiveRoomCaptureRegion/);
  assert.match(source, /profile !== "douyin-live-room"/);
  assert.match(source, /captureRegionSource/);
  assert.match(source, /LIVE_ROOM_CAPTURE_RETRY_COUNT/);
  assert.match(source, /screen\.querySelector\?\.\("canvas"\)/);
  assert.match(source, /toDataURL\("image\/jpeg"/);
  assert.match(source, /event\.source !== globalThis\.parent/);
  assert.match(source, /event\.origin !== globalThis\.location\?\.origin/);
});

test("embedded viewers record the rendered VNC Canvas as rolling WebM segments", () => {
  assert.match(source, /const WORK_RECORDING_SEGMENT_MS = 5_000/);
  assert.match(source, /captureCanvas\.captureStream\(WORK_RECORDING_FRAME_RATE\)/);
  assert.match(source, /new globalThis\.MediaRecorder/);
  assert.match(source, /byering-cloud-recording-segment/);
  assert.match(source, /byering-cloud-viewer-recording-start/);
  assert.match(source, /createCaptureCanvas\(canvas, captureResolution/);
  assert.match(source, /captureResolution\.region/);
  assert.match(source, /recordingRetryTimer/);
  assert.match(source, /stopWorkRecording\(\)/);
  assert.doesNotMatch(source, /notifyParent\("recording"/);
});
