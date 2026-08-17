const PILOT_ROOT = "/workbench/byering/pilot/runtime/spritesheet/agent/";
const ACTION_PATTERN = /\/spritesheet\/agent\/(fc_(?:cheer1_sub|cheer2_sub|cheer_main|coffee|drink_coffee|fall_down|high_press|leaving|off_chair|peek|pooping|running_treadmill|salute|screen_playing1|screen_playing2|screen_playing3|screen_working_apk_use|screen_working_file_use|screen_working_main|screen_working_search_or_browser_use|screen_working_win_use|sigh|sleeping|standby|talking_on_seat|talking_on_stand|ticket|walking_h|walking_up|working))(?:-[0-9]+)?(?:@2x)?\.(webp|ktx2)(\.json)?$/;

function pilotUrl(requestUrl) {
  const url = new URL(requestUrl);
  const match = ACTION_PATTERN.exec(url.pathname);
  if (!match) return null;
  const action = match[1];
  const metadata = match[3] ? ".webp.json" : ".webp";
  return new URL(`${PILOT_ROOT}${action}${metadata}`, self.location.origin);
}

self.addEventListener("fetch", (event) => {
  const mapped = pilotUrl(event.request.url);
  if (!mapped) return;
  event.respondWith(fetch(mapped));
});
