import {
  getStats,
  getStatsForKeys,
  getVisits,
  getVisitsForKeys,
  getDailyTotals,
  getAvailableNormalDateKeys,
  sortedEntries,
  totalSeconds,
} from "./common/storage.js";
import { dateKey, offsetDateKey, shiftDateKey, formatDuration } from "./common/util.js";
import { icons } from "./common/icons.js";
import { renderRankedBars, renderTrendChart, renderShareBar } from "./common/charts.js";
import { colorForDomain, OTHER_COLOR } from "./common/palette.js";

const el = (id) => document.getElementById(id);
const ACCENT = "#88c0d0"; // --accent / nord8, used only for the single-series trend chart
const MAX_TREND_BARS = 60;

el("optionsBtn").innerHTML = `${icons.gear} Options`;
el("privateBadge").innerHTML = `${icons.mask} This session`;

// The day the "Daily" filter is currently showing. Defaults to today and
// moves via the prev/next arrows or the date picker in #dayNav.
let selectedDay = dateKey();

async function keysForRange(range) {
  if (range === "today") return [selectedDay];
  if (range === "7d") return Array.from({ length: 7 }, (_, i) => offsetDateKey(6 - i));
  if (range === "30d") return Array.from({ length: 30 }, (_, i) => offsetDateKey(29 - i));
  // all time
  const available = (await getAvailableNormalDateKeys()).slice().reverse(); // chronological
  return available.length ? available : [dateKey()];
}

async function renderForRange(range) {
  const keys = await keysForRange(range);
  const [stats, visits, dailyTotals] = await Promise.all([
    getStatsForKeys(keys),
    getVisitsForKeys(keys),
    getDailyTotals(keys),
  ]);
  const entries = sortedEntries(stats);
  const total = totalSeconds(stats);
  const activeDays = dailyTotals.filter((d) => d.total > 0).length;

  el("kpiTotal").textContent = formatDuration(total);
  el("kpiTop").textContent = entries.length ? entries[0][0] : "—";
  el("kpiActiveDays").textContent = String(activeDays);
  el("kpiAverage").textContent = formatDuration(keys.length ? total / keys.length : 0);

  const trendData = dailyTotals.length > MAX_TREND_BARS ? dailyTotals.slice(-MAX_TREND_BARS) : dailyTotals;
  renderTrendChart(el("trendChart"), trendData, ACCENT);
  el("trendChart").hidden = total === 0;
  el("trendEmpty").hidden = total > 0;

  renderRankedBars(el("rankedList"), el("rankedEmpty"), entries, colorForDomain, visits);

  renderShareBar(el("shareBar"), el("shareLegend"), entries, colorForDomain, OTHER_COLOR);
  el("shareEmpty").hidden = entries.length > 0;
  el("shareBar").hidden = entries.length === 0;
}

async function renderPrivateSection() {
  const [stats, visits] = await Promise.all([getStats(dateKey(), true), getVisits(dateKey(), true)]);
  const entries = sortedEntries(stats);
  el("privateTotal").textContent = formatDuration(totalSeconds(stats));
  renderRankedBars(el("privateList"), el("privateEmpty"), entries, colorForDomain, visits);
}

function updateDayNav() {
  el("dayPicker").value = selectedDay;
  el("nextDayBtn").disabled = selectedDay >= dateKey();
}

function wireFilterRow() {
  const buttons = [...document.querySelectorAll(".filter-btn")];
  const dayNav = el("dayNav");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.toggle("active", b === btn));
      const isDaily = btn.dataset.range === "today";
      dayNav.classList.toggle("day-nav-hidden", !isDaily);
      if (isDaily) {
        selectedDay = dateKey();
        updateDayNav();
      }
      renderForRange(btn.dataset.range);
    });
  });

  el("prevDayBtn").addEventListener("click", () => {
    selectedDay = shiftDateKey(selectedDay, -1);
    updateDayNav();
    renderForRange("today");
  });
  el("nextDayBtn").addEventListener("click", () => {
    if (selectedDay >= dateKey()) return;
    selectedDay = shiftDateKey(selectedDay, 1);
    updateDayNav();
    renderForRange("today");
  });
  el("dayPicker").addEventListener("change", () => {
    const picked = el("dayPicker").value || dateKey();
    // The `max` attribute keeps the native picker UI from offering future
    // dates, but doesn't stop a typed value, so clamp defensively here too.
    selectedDay = picked > dateKey() ? dateKey() : picked;
    updateDayNav();
    renderForRange("today");
  });
}

async function init() {
  el("optionsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
  el("dayPicker").max = dateKey();
  updateDayNav();
  wireFilterRow();
  const activeBtn = document.querySelector(".filter-btn.active") || document.querySelector(".filter-btn");
  await Promise.all([renderForRange(activeBtn.dataset.range), renderPrivateSection()]);
}

init();
