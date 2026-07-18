import { domainFromUrl, dateKey } from "./common/util.js";
import { addTime, addVisit, getSettings } from "./common/storage.js";
import { syncRules } from "./common/blocklist.js";

// -- Tracking state -----------------------------------------------------
// This module is a service worker: Chrome can suspend and restart it at any
// moment between events. All state below is therefore treated as a cache
// that gets rebuilt from scratch (via refreshActive) on every wake-up, and
// every state transition flushes accumulated time before moving on so a
// restart never loses more than the last few seconds.
//
// Pause state is recomputed fresh on every call to refreshActive from two
// inputs - screen lock state and window focus - rather than toggled
// piecemeal by individual event handlers, so there's a single source of
// truth and no risk of a stale "paused" flag surviving a focus/lock
// transition.

let activeTabId = null;
let activeDomain = null;
let activeIsIncognito = false;
let tickStart = null; // ms timestamp, null when nothing is being timed
let paused = true;
let systemIdle = false;

// Which domain each open tab is currently showing - used only to detect a
// genuine navigation (see tabs.onUpdated below), so visits are counted per
// page load rather than per focus change. Switching back to a tab that's
// already sitting on a domain, or a same-URL reload, doesn't touch this map
// and so doesn't add a visit. Mirrored into session storage for the same
// reason as the tick state below - otherwise a worker restart mid-binge
// (e.g. clicking to the next video after the worker suspended from
// inactivity) would look like a fresh visit to a site already open.
const TAB_DOMAINS_KEY = "tabDomains";
let tabDomains = new Map();

async function persistTabDomains() {
  await chrome.storage.session.set({ [TAB_DOMAINS_KEY]: Object.fromEntries(tabDomains) });
}

// Chrome can (and does) kill this service worker after ~30s with no
// extension-API activity - e.g. while someone just watches a video with no
// tab switches or focus changes - and the periodic heartbeat alarm below
// wakes it back up. Waking it re-runs this whole module from scratch, which
// would silently reset all the state above to null/true and lose whatever
// time had accumulated since the last flush. To survive that, the
// in-progress tick is mirrored into session storage (which outlives worker
// restarts, unlike the variables above) on every change, and replayed once
// here before any other tracking logic runs.
const STATE_KEY = "tickState";
let restorePromise = null;

async function persistTick() {
  if (paused || !activeDomain || !tickStart) {
    await chrome.storage.session.remove(STATE_KEY);
  } else {
    await chrome.storage.session.set({
      [STATE_KEY]: { domain: activeDomain, isIncognito: activeIsIncognito, startedAt: tickStart, day: dateKey() },
    });
  }
}

async function restoreTick() {
  const stored = await chrome.storage.session.get([STATE_KEY, TAB_DOMAINS_KEY]);

  if (stored[TAB_DOMAINS_KEY]) {
    tabDomains = new Map(Object.entries(stored[TAB_DOMAINS_KEY]));
  }

  const state = stored[STATE_KEY];
  if (!state) return;
  await chrome.storage.session.remove(STATE_KEY);
  const elapsedSeconds = (Date.now() - state.startedAt) / 1000;
  if (elapsedSeconds > 0.5) {
    await addTime(state.day, state.domain, elapsedSeconds, state.isIncognito);
  }
}

function ensureRestored() {
  if (!restorePromise) restorePromise = restoreTick();
  return restorePromise;
}

async function flush() {
  await ensureRestored();
  if (!activeDomain || !tickStart || paused) return;
  const now = Date.now();
  const elapsedSeconds = (now - tickStart) / 1000;
  tickStart = now;
  if (elapsedSeconds > 0.5) {
    await addTime(dateKey(), activeDomain, elapsedSeconds, activeIsIncognito);
  }
  await persistTick();
}

async function setActive(tabId, domain, isIncognito) {
  await flush();
  activeTabId = tabId;
  activeDomain = domain;
  activeIsIncognito = isIncognito;
  tickStart = domain ? Date.now() : null;
  await persistTick();
}

async function pauseTracking() {
  await flush();
  paused = true;
  tickStart = null;
  await persistTick();
}

async function refreshActive() {
  const settings = await getSettings();

  let windowFocused = false;
  let tab = null;
  try {
    const win = await chrome.windows.getLastFocused({ populate: false, windowTypes: ["normal", "popup"] });
    windowFocused = !!(win && win.focused);
    if (windowFocused) {
      [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
    }
  } catch {
    windowFocused = false;
  }

  const shouldPause = !windowFocused || (settings.pauseWhenIdle && systemIdle);

  if (shouldPause) {
    await pauseTracking();
    return;
  }

  paused = false;

  if (!tab) {
    await setActive(null, null, false);
    return;
  }
  const domain = domainFromUrl(tab.url || "");
  await setActive(tab.id, domain, !!tab.incognito);
}

// -- Event wiring ---------------------------------------------------------

chrome.tabs.onActivated.addListener(() => {
  refreshActive();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // changeInfo.url only appears when the tab actually navigated to a new
  // URL - not on a same-URL reload (no url property in that case) and not
  // on tab/window focus changes (this listener doesn't fire for those at
  // all). That makes it the right signal for "fresh visit," as opposed to
  // refreshActive() below, which just tracks which already-loaded domain is
  // currently being watched.
  if (changeInfo.url) {
    await ensureRestored();
    const domain = domainFromUrl(changeInfo.url);
    if (domain && domain !== tabDomains.get(tabId)) {
      await addVisit(dateKey(), domain, !!tab.incognito);
    }
    tabDomains.set(tabId, domain);
    await persistTabDomains();
  }

  if (tabId === activeTabId && (changeInfo.url || changeInfo.status === "complete")) {
    refreshActive();
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabDomains.delete(tabId)) await persistTabDomains();
  if (tabId === activeTabId) {
    refreshActive();
  }
});

chrome.windows.onFocusChanged.addListener(() => {
  refreshActive();
});

chrome.idle.onStateChanged.addListener((state) => {
  // Only treat an actual screen lock as "idle" for pausing purposes - mere
  // mouse/keyboard inactivity ("idle" state) shouldn't stop the clock, since
  // e.g. watching a video or listening to audio involves no input at all.
  systemIdle = state === "locked";
  refreshActive();
});

chrome.idle.setDetectionInterval(60);

chrome.alarms.create("heartbeat", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "heartbeat") flush();
});

chrome.runtime.onStartup.addListener(refreshActive);
chrome.runtime.onInstalled.addListener(refreshActive);

// declarativeNetRequest dynamic rules already persist across restarts on
// their own; only re-sync on install/update, as a safety net against the
// stored rule-id map ever drifting from what's actually registered.
chrome.runtime.onInstalled.addListener(() => {
  syncRules();
});

// Also handle the very first load of this service worker (e.g. after an
// update or manual reload from chrome://extensions).
refreshActive();
