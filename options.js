import { getSettings, setSettings } from "./common/storage.js";
import {
  getBlockedSites,
  addBlockedSite,
  removeBlockedSite,
  isBlockingEnabled,
  setBlockingEnabled,
  syncRules,
} from "./common/blocklist.js";
import { showChallenge } from "./common/challenge.js";
import { normalizeDomainInput, escapeHtml } from "./common/util.js";
import { icons } from "./common/icons.js";

const el = (id) => document.getElementById(id);

el("dashboardBtn").innerHTML = `${icons.clock} Dashboard`;
el("dashboardBtn").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") }));

function flashSaved() {
  const node = el("savedIndicator");
  node.hidden = false;
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => (node.hidden = true), 1500);
}

async function initSettingsSection() {
  const settings = await getSettings();
  el("pauseWhenIdleCheckbox").checked = settings.pauseWhenIdle;

  el("pauseWhenIdleCheckbox").addEventListener("change", async () => {
    await setSettings({ pauseWhenIdle: el("pauseWhenIdleCheckbox").checked });
    flashSaved();
  });
}

async function renderBlockedList() {
  const sites = await getBlockedSites();
  el("blockedEmpty").hidden = sites.length > 0;
  el("blockedList").innerHTML = "";
  for (const domain of sites) {
    const row = document.createElement("div");
    row.className = "blocked-row";
    row.innerHTML = `
      <span class="blocked-domain-name" title="${escapeHtml(domain)}">${escapeHtml(domain)}</span>
      <button class="link-btn blocked-remove-btn" type="button">${icons.trash} Remove</button>`;
    row.querySelector(".blocked-remove-btn").addEventListener("click", async () => {
      const ok = await showChallenge({ message: `Solve this to unblock ${domain}:` });
      if (!ok) return;
      await removeBlockedSite(domain);
      await renderBlockedList();
    });
    el("blockedList").appendChild(row);
  }
}

async function initBlockingSection() {
  const checkbox = el("blockingEnabledCheckbox");
  checkbox.checked = await isBlockingEnabled();

  checkbox.addEventListener("change", async () => {
    if (!checkbox.checked) {
      const ok = await showChallenge({ message: "Solve this to turn blocking off:" });
      if (!ok) {
        checkbox.checked = true;
        return;
      }
    }
    await setBlockingEnabled(checkbox.checked);
    flashSaved();
  });

  el("blockSiteBtn").addEventListener("click", async () => {
    const domain = normalizeDomainInput(el("blockSiteInput").value);
    el("blockError").hidden = true;
    if (!domain) {
      el("blockError").textContent = "Enter a valid domain, like example.com.";
      el("blockError").hidden = false;
      return;
    }
    await addBlockedSite(domain);
    el("blockSiteInput").value = "";
    await renderBlockedList();
    flashSaved();
  });
  el("blockSiteInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") el("blockSiteBtn").click();
  });

  await renderBlockedList();
}

function initResetSection() {
  el("resetBtn").addEventListener("click", async () => {
    const confirmed = confirm("This deletes all tracked browsing history and blocked sites. This cannot be undone. Continue?");
    if (!confirmed) return;
    await chrome.storage.local.clear();
    // declarativeNetRequest rules live outside chrome.storage, so clearing
    // storage alone would leave any active block rules orphaned with no
    // stored data left to manage them from - tear them down explicitly.
    await syncRules();
    location.reload();
  });
}

initSettingsSection();
initBlockingSection();
initResetSection();
