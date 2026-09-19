// Small dependency-free chart primitives shared by the popup and the
// dashboard. No charting library - plain HTML: ranked magnitude bars and
// the share-of-time bar, both with direct labels and hover + keyboard-focus
// tooltips.

import { escapeHtml, formatDuration } from "./util.js";

// -- shared tooltip ---------------------------------------------------------

let tooltipEl = null;
function tooltip() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement("div");
  tooltipEl.className = "chart-tooltip";
  tooltipEl.hidden = true;
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function showTooltip(target, html) {
  const t = tooltip();
  t.innerHTML = html;
  t.hidden = false;
  const r = target.getBoundingClientRect();
  const tw = t.offsetWidth;
  let left = r.left + r.width / 2 - tw / 2;
  left = Math.max(6, Math.min(left, window.innerWidth - tw - 6));
  t.style.left = `${left + window.scrollX}px`;
  t.style.top = `${r.top + window.scrollY - t.offsetHeight - 8}px`;
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.hidden = true;
}

function wireHover(el, htmlFn) {
  const enter = () => showTooltip(el, htmlFn());
  el.addEventListener("mouseenter", enter);
  el.addEventListener("mousemove", enter);
  el.addEventListener("mouseleave", hideTooltip);
  el.addEventListener("focus", enter);
  el.addEventListener("blur", hideTooltip);
}

// -- ranked magnitude bar list (one series -> one accent hue) --------------

// colorOf: domain -> hex, e.g. colorForDomain from common/palette.js. Each
// row gets its own hue instead of one flat accent for the whole list, so
// rows are distinguishable at a glance and the color repeats consistently
// wherever that domain shows up (ranked list, share bar, legend).
export function renderRankedBars(container, emptyNode, entries, colorOf, visits = {}) {
  emptyNode.hidden = entries.length > 0;
  container.innerHTML = "";
  if (entries.length === 0) return;
  const max = entries[0][1];
  for (const [domain, seconds] of entries) {
    const pct = Math.max(4, Math.round((seconds / max) * 100));
    const color = colorOf(domain);
    const visitCount = visits[domain] || 0;
    // Duration stays neutral/muted; visit count is tinted with the same
    // color as the magnitude bar, so color consistently means "how often"
    // while the bar/muted-time pairing means "how much".
    const visitEl = visitCount
      ? `<span class="stat-visits" style="color:${color}">${visitCount} visit${visitCount === 1 ? "" : "s"}</span>`
      : "";
    const row = document.createElement("div");
    row.className = "stat-row";
    row.innerHTML = `
      <div class="stat-row-top">
        <span class="stat-domain" title="${escapeHtml(domain)}">${escapeHtml(domain)}</span>
        <span class="stat-meta">
          <span class="stat-time">${formatDuration(seconds)}</span>
          ${visitEl}
        </span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>`;
    container.appendChild(row);
  }
}

// -- share-of-time stacked bar (part-to-whole, categorical) -----------------

// entries: [domain, seconds][], already sorted desc. colorOf(domain) -> hex.
export function renderShareBar(barContainer, legendContainer, entries, colorOf, otherColor, maxSegments = 7) {
  barContainer.innerHTML = "";
  legendContainer.innerHTML = "";
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total <= 0 || entries.length === 0) return;

  const shown = entries.slice(0, maxSegments);
  const rest = entries.slice(maxSegments);
  const otherTotal = rest.reduce((s, [, v]) => s + v, 0);

  const segments = shown.map(([domain, seconds]) => ({ domain, seconds, color: colorOf(domain) }));
  if (otherTotal > 0) segments.push({ domain: "Other", seconds: otherTotal, color: otherColor });

  segments.forEach((seg, i) => {
    const pct = (seg.seconds / total) * 100;
    const el = document.createElement("div");
    el.className = "share-segment";
    el.style.width = `${pct}%`;
    el.style.background = seg.color;
    if (i === 0) el.style.borderTopLeftRadius = el.style.borderBottomLeftRadius = "4px";
    if (i === segments.length - 1) {
      el.style.borderTopRightRadius = el.style.borderBottomRightRadius = "4px";
    } else {
      el.style.marginRight = "2px";
    }
    el.tabIndex = 0;
    wireHover(el, () => `<strong>${escapeHtml(seg.domain)}</strong><br>${formatDuration(seg.seconds)} · ${pct.toFixed(1)}%`);
    barContainer.appendChild(el);
  });

  for (const seg of segments) {
    const pct = (seg.seconds / total) * 100;
    const row = document.createElement("div");
    row.className = "legend-row";
    row.innerHTML = `
      <span class="legend-swatch" style="background:${seg.color}"></span>
      <span class="legend-name" title="${escapeHtml(seg.domain)}">${escapeHtml(seg.domain)}</span>
      <span class="legend-value">${formatDuration(seg.seconds)} · ${pct.toFixed(1)}%</span>`;
    legendContainer.appendChild(row);
  }
}
