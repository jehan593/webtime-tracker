// Stats storage.
//
// Normal (non-incognito) browsing time lives in chrome.storage.local and
// persists across restarts. Private (incognito) browsing time lives only in
// chrome.storage.session, which Chrome wipes automatically as soon as the
// last private window closes (destroying the incognito profile), and is
// never written to disk. Both storage areas are namespaced by day so
// history stays browsable.

const NORMAL_PREFIX = "normal:";
const PRIVATE_PREFIX = "private:";
const VISITS_NORMAL_PREFIX = "visitsNormal:";
const VISITS_PRIVATE_PREFIX = "visitsPrivate:";
const SETTINGS_KEY = "settings";

const DEFAULT_SETTINGS = {
  pauseWhenIdle: true,
};

export async function getSettings() {
  const { [SETTINGS_KEY]: settings } = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

export async function setSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function addTime(dateKey, domain, seconds, isPrivate) {
  if (!domain || !(seconds > 0)) return;
  const area = isPrivate ? chrome.storage.session : chrome.storage.local;
  const key = (isPrivate ? PRIVATE_PREFIX : NORMAL_PREFIX) + dateKey;
  const existing = (await area.get(key))[key] || {};
  existing[domain] = (existing[domain] || 0) + seconds;
  await area.set({ [key]: existing });
}

export async function getStats(dateKey, isPrivate) {
  const area = isPrivate ? chrome.storage.session : chrome.storage.local;
  const key = (isPrivate ? PRIVATE_PREFIX : NORMAL_PREFIX) + dateKey;
  const result = await area.get(key);
  return result[key] || {};
}

// A "visit" is one continuous stretch of a domain being the active tab -
// incremented by background.js whenever tracking starts on a domain that
// isn't the one it was already tracking (see setActive there). Stored
// separately from seconds so the existing seconds-keyed maps/functions don't
// need to know about the extra field.
export async function addVisit(dateKey, domain, isPrivate) {
  if (!domain) return;
  const area = isPrivate ? chrome.storage.session : chrome.storage.local;
  const key = (isPrivate ? VISITS_PRIVATE_PREFIX : VISITS_NORMAL_PREFIX) + dateKey;
  const existing = (await area.get(key))[key] || {};
  existing[domain] = (existing[domain] || 0) + 1;
  await area.set({ [key]: existing });
}

export async function getVisits(dateKey, isPrivate) {
  const area = isPrivate ? chrome.storage.session : chrome.storage.local;
  const key = (isPrivate ? VISITS_PRIVATE_PREFIX : VISITS_NORMAL_PREFIX) + dateKey;
  const result = await area.get(key);
  return result[key] || {};
}

async function getAllByPrefix(prefix) {
  const all = await chrome.storage.local.get(null);
  const byDate = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(prefix)) byDate[k.slice(prefix.length)] = v;
  }
  return byDate;
}

export async function getAvailableNormalDateKeys() {
  const byDate = await getAllByPrefix(NORMAL_PREFIX);
  return Object.keys(byDate).sort().reverse();
}

// Merges stats across every key in dateKeys into one {domain: seconds} map -
// used to total up a multi-day range (7 days, 30 days, all time) in one pass.
export async function getStatsForKeys(dateKeys) {
  const byDate = await getAllByPrefix(NORMAL_PREFIX);
  const merged = {};
  for (const key of dateKeys) {
    const stats = byDate[key] || {};
    for (const [domain, seconds] of Object.entries(stats)) {
      merged[domain] = (merged[domain] || 0) + seconds;
    }
  }
  return merged;
}

// Same merge as getStatsForKeys, but for visit counts.
export async function getVisitsForKeys(dateKeys) {
  const byDate = await getAllByPrefix(VISITS_NORMAL_PREFIX);
  const merged = {};
  for (const key of dateKeys) {
    const visits = byDate[key] || {};
    for (const [domain, count] of Object.entries(visits)) {
      merged[domain] = (merged[domain] || 0) + count;
    }
  }
  return merged;
}

// Per-day totals for dateKeys, in the order given - used for the trend chart.
export async function getDailyTotals(dateKeys) {
  const byDate = await getAllByPrefix(NORMAL_PREFIX);
  return dateKeys.map((key) => ({ key, total: totalSeconds(byDate[key] || {}) }));
}

export function sortedEntries(statsObj) {
  return Object.entries(statsObj).sort((a, b) => b[1] - a[1]);
}

export function totalSeconds(statsObj) {
  return Object.values(statsObj).reduce((sum, v) => sum + v, 0);
}
