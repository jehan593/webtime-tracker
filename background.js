import { domainFromUrl, dateKey } from "./common/util.js";
import { addTime, getSettings } from "./common/storage.js";
import { syncRules } from "./common/blocklist.js";

// -- Tracking state -----------------------------------------------------
// This module is a service worker: Chrome can suspend and restart it at any
// moment between events. All state below is therefore treated as a cache
// that gets rebuilt from scratch (via refreshActive) on every wake-up, and
// every state transition flushes accumulated time before moving on so a
// restart never loses more than the last few seconds.
//
// Pause state is recomputed fresh on every call to refreshActive from two
// inputs - system idle state and window focus - rather than toggled
// piecemeal by individual event handlers, so there's a single source of
// truth and no risk of a stale "paused" flag surviving a focus/idle
// transition.

let activeTabId = null;
let activeDomain = null;
let activeIsIncognito = false;
let tickStart = null; // ms timestamp, null when nothing is being timed
let paused = true;
let systemIdle = false;

async function flush() {
  if (!activeDomain || !tickStart || paused) return;
  const now = Date.now();
  const elapsedSeconds = (now - tickStart) / 1000;
  tickStart = now;
  if (elapsedSeconds > 0.5) {
    await addTime(dateKey(), activeDomain, elapsedSeconds, activeIsIncognito);
  }
}

async function setActive(tabId, domain, isIncognito) {
  await flush();
  activeTabId = tabId;
  activeDomain = domain;
  activeIsIncognito = isIncognito;
  tickStart = domain ? Date.now() : null;
}

async function pauseTracking() {
  await flush();
  paused = true;
  tickStart = null;
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && (changeInfo.url || changeInfo.status === "complete")) {
    refreshActive();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    refreshActive();
  }
});

chrome.windows.onFocusChanged.addListener(() => {
  refreshActive();
});

chrome.idle.onStateChanged.addListener((state) => {
  systemIdle = state !== "active";
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
