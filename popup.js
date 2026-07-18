import { getStats, sortedEntries, totalSeconds } from "./common/storage.js";
import { dateKey, formatDuration } from "./common/util.js";
import { icons } from "./common/icons.js";
import { renderRankedBars } from "./common/charts.js";

const el = (id) => document.getElementById(id);
const ACCENT = "#88c0d0"; // --accent / nord8
const PRIVATE_ACCENT = "#b48ead"; // --private / nord15

el("dashboardBtn").innerHTML = `${icons.clock} Dashboard`;
el("optionsBtn").innerHTML = `${icons.gear} Options`;
el("tabNormalBtn").innerHTML = `${icons.globe} Normal`;
el("tabPrivateBtn").innerHTML = `${icons.mask} Private`;
el("privateBadge").innerHTML = `${icons.mask} Private`;

function switchTab(which) {
  const normal = which === "normal";
  el("tabNormalBtn").classList.toggle("active", normal);
  el("tabPrivateBtn").classList.toggle("active", !normal);
  el("normalPane").hidden = !normal;
  el("privatePane").hidden = normal;
  if (!normal) renderPrivatePane();
}

async function renderNormalPane() {
  const stats = await getStats(dateKey(), false);
  el("normalTotal").textContent = formatDuration(totalSeconds(stats));
  renderRankedBars(el("normalList"), el("normalEmpty"), sortedEntries(stats), ACCENT);
}

async function renderPrivatePane() {
  const stats = await getStats(dateKey(), true);
  el("privateTotal").textContent = formatDuration(totalSeconds(stats));
  renderRankedBars(el("privateList"), el("privateEmpty"), sortedEntries(stats), PRIVATE_ACCENT);
}

async function init() {
  el("dashboardBtn").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") }));
  el("optionsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
  el("tabNormalBtn").addEventListener("click", () => switchTab("normal"));
  el("tabPrivateBtn").addEventListener("click", () => switchTab("private"));

  await renderNormalPane();
}

init();
