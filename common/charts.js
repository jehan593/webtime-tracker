// Small dependency-free chart primitives shared by the popup and the
// dashboard. No charting library - just SVG/HTML built by hand, styled to
// the mark specs in the project's dataviz guidance (thin marks, 4px
// rounded bar ends square at the baseline, 2px surface gaps between
// touching marks, hairline recessive gridlines, sparing direct labels,
// hover + keyboard-focus tooltips).

import { escapeHtml, formatDuration } from "./util.js";

const SURFACE = "#2e3440"; // --bg / nord0, the chart surface every mark sits on

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

// -- trend bar chart (magnitude over time, single hue) ----------------------

const NICE_STEPS_SECONDS = [
  60, 300, 900, 1800, 3600, 2 * 3600, 4 * 3600, 8 * 3600, 12 * 3600, 24 * 3600, 48 * 3600, 96 * 3600, 168 * 3600,
];

function niceMax(value) {
  for (const step of NICE_STEPS_SECONDS) {
    if (value <= step) return step;
  }
  const last = NICE_STEPS_SECONDS[NICE_STEPS_SECONDS.length - 1];
  return Math.ceil(value / last) * last;
}

function roundedTopBarPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  if (h <= 0) return "";
  if (r <= 0) return `M${x},${y} h${w} v${h} h${-w} Z`;
  return `M${x},${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} H${x} Z`;
}

function shortDateLabel(dateKeyStr) {
  const [, m, d] = dateKeyStr.split("-");
  return `${Number(m)}/${Number(d)}`;
}

const NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export function renderTrendChart(container, dailyTotals, accent) {
  container.innerHTML = "";
  if (dailyTotals.length === 0) return;

  const W = 640;
  const H = 220;
  const padLeft = 46;
  const padRight = 8;
  const padTop = 20;
  const padBottom = 28;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "trend-chart", role: "img" });

  const maxVal = niceMax(Math.max(1, ...dailyTotals.map((d) => d.total)));
  const gridSteps = [0, 0.5, 1];
  for (const g of gridSteps) {
    const y = padTop + plotH * (1 - g);
    svg.appendChild(svgEl("line", { x1: padLeft, x2: W - padRight, y1: y, y2: y, class: "chart-grid" }));
    const label = svgEl("text", { x: padLeft - 8, y: y + 4, class: "chart-axis-label", "text-anchor": "end" });
    label.textContent = formatDuration(maxVal * g);
    svg.appendChild(label);
  }

  const n = dailyTotals.length;
  const slot = plotW / n;
  const barW = Math.min(24, slot * 0.6);
  const maxIndex = dailyTotals.reduce((best, d, i) => (d.total > dailyTotals[best].total ? i : best), 0);

  const tickEvery = Math.max(1, Math.ceil(n / 8));

  dailyTotals.forEach((d, i) => {
    const slotX = padLeft + i * slot;
    const barH = plotH * (d.total / maxVal);
    const x = slotX + (slot - barW) / 2;
    const y = padTop + plotH - barH;

    if (barH > 0.5) {
      const path = svgEl("path", { d: roundedTopBarPath(x, y, barW, barH, 4), class: "chart-bar", fill: accent });
      svg.appendChild(path);
    }

    if (i === maxIndex && d.total > 0) {
      const label = svgEl("text", {
        x: slotX + slot / 2,
        y: Math.max(padTop - 6, y - 6),
        class: "chart-bar-label",
        "text-anchor": "middle",
      });
      label.textContent = formatDuration(d.total);
      svg.appendChild(label);
    }

    if (i % tickEvery === 0 || i === n - 1) {
      const tick = svgEl("text", {
        x: slotX + slot / 2,
        y: H - 8,
        class: "chart-axis-label",
        "text-anchor": "middle",
      });
      tick.textContent = shortDateLabel(d.key);
      svg.appendChild(tick);
    }

    const hit = svgEl("rect", {
      x: slotX,
      y: padTop,
      width: slot,
      height: plotH,
      fill: "transparent",
      tabindex: "0",
      class: "chart-hit",
    });
    wireHover(hit, () => `<strong>${shortDateLabel(d.key)}</strong><br>${formatDuration(d.total)}`);
    svg.appendChild(hit);
  });

  container.appendChild(svg);
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
