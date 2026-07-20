// Website blocking, enforced with declarativeNetRequest dynamic rules rather
// than a content script or webRequest - the browser handles the redirect
// natively before the blocked page ever loads, so there's no per-tab script
// injected into every site you visit.

const BLOCKED_SITES_KEY = "blockedSites"; // string[]
const BLOCKING_ENABLED_KEY = "blockingEnabled"; // boolean, default true
const RULE_MAP_KEY = "blockRuleMap"; // { [domain]: ruleId }
const NEXT_RULE_ID_KEY = "nextBlockRuleId"; // number

// All chrome.storage.local keys this module owns - exported so a "reset all
// data" feature elsewhere can wipe everything else while leaving the block
// list (and the dynamic rules that depend on its rule-id map) intact.
export const BLOCKLIST_STORAGE_KEYS = [BLOCKED_SITES_KEY, BLOCKING_ENABLED_KEY, RULE_MAP_KEY, NEXT_RULE_ID_KEY];

export async function getBlockedSites() {
  const { [BLOCKED_SITES_KEY]: sites } = await chrome.storage.local.get(BLOCKED_SITES_KEY);
  return sites || [];
}

export async function isBlockingEnabled() {
  const { [BLOCKING_ENABLED_KEY]: enabled } = await chrome.storage.local.get(BLOCKING_ENABLED_KEY);
  return enabled !== false;
}

async function getRuleMap() {
  const { [RULE_MAP_KEY]: map } = await chrome.storage.local.get(RULE_MAP_KEY);
  return map || {};
}

async function takeNextRuleId() {
  const { [NEXT_RULE_ID_KEY]: n } = await chrome.storage.local.get(NEXT_RULE_ID_KEY);
  const id = (n || 0) + 1;
  await chrome.storage.local.set({ [NEXT_RULE_ID_KEY]: id });
  return id;
}

function ruleForDomain(domain, id) {
  return {
    id,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { extensionPath: `/blocked.html?site=${encodeURIComponent(domain)}` },
    },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: ["main_frame", "sub_frame"],
    },
  };
}

// Returns false if the domain was already blocked (no-op), true if it was added.
export async function addBlockedSite(domain) {
  const sites = await getBlockedSites();
  if (sites.includes(domain)) return false;
  sites.push(domain);
  await chrome.storage.local.set({ [BLOCKED_SITES_KEY]: sites });

  if (await isBlockingEnabled()) {
    const map = await getRuleMap();
    const id = await takeNextRuleId();
    map[domain] = id;
    await chrome.storage.local.set({ [RULE_MAP_KEY]: map });
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [ruleForDomain(domain, id)] });
  }
  return true;
}

export async function removeBlockedSite(domain) {
  const sites = (await getBlockedSites()).filter((d) => d !== domain);
  await chrome.storage.local.set({ [BLOCKED_SITES_KEY]: sites });

  const map = await getRuleMap();
  const id = map[domain];
  if (id) {
    delete map[domain];
    await chrome.storage.local.set({ [RULE_MAP_KEY]: map });
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [id] });
  }
}

export async function setBlockingEnabled(enabled) {
  await chrome.storage.local.set({ [BLOCKING_ENABLED_KEY]: enabled });
  await syncRules();
}

// Rebuilds dynamic rules from the stored site list against whatever rules
// currently exist. Cheap for a personal block list (tens of domains), and
// makes sure a browser/extension-update edge case never leaves rules
// pointing at stale ids or drifting from the stored list.
export async function syncRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const existingIds = existing.map((r) => r.id);
  if (existingIds.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existingIds });
  }

  if (!(await isBlockingEnabled())) {
    await chrome.storage.local.set({ [RULE_MAP_KEY]: {} });
    return;
  }

  const sites = await getBlockedSites();
  const map = {};
  const rules = [];
  for (const domain of sites) {
    const id = await takeNextRuleId();
    map[domain] = id;
    rules.push(ruleForDomain(domain, id));
  }
  await chrome.storage.local.set({ [RULE_MAP_KEY]: map });
  if (rules.length) await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
}
