# Time Tracker

A Chrome extension that tracks how much time you spend on each website, with
private/incognito windows tracked completely separately.

## Features

- **Per-site time tracking** — tracks the active tab in the focused window,
  pausing automatically when the browser loses focus or the screen locks.
- **Private windows tracked separately** — incognito time is written to
  `chrome.storage.session` only (in-memory), never to disk. Chrome destroys
  that data as soon as your last private window closes — the incognito
  profile is torn down at that point — even if your regular Chrome windows
  stay open. It never mixes with your normal history.
- **Popup shows today at a glance**; a full **Dashboard** (opens in its own
  tab) covers everything else — Today / 7 days / 30 days / All time filters,
  KPI tiles, a daily trend chart, the full ranked site list, and a
  share-of-time breakdown.
- **Website blocking**, enforced by the browser itself via
  `declarativeNetRequest` redirect rules — no content script runs on pages
  you visit. Adding a site to the block list is instant; removing one, or
  turning blocking off, requires solving a short arithmetic problem first
  (see **Blocking** below).
- **Nord themed**, typeset in Martian Mono Nerd Font (falls back to Martian
  Mono, then a system monospace font, if the Nerd Font isn't installed).

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.

## Enable incognito tracking

Chrome extensions are blocked from incognito windows by default. To track
private windows:

1. Open `chrome://extensions`.
2. Find **Time Tracker** → **Details**.
3. Turn on **Allow in Incognito**.

Without this step, the extension simply won't run in incognito windows at
all — nothing is tracked there, private or otherwise.

## Dashboard

Click **Dashboard** in the popup footer (or in the options page header) to
open the full-page view in a new tab:

- **Filter row** (Today / 7 days / 30 days / All time) scopes every chart
  below it.
- **KPI tiles** — total time, top site, active days, daily average.
- **Trend chart** — a bar per day, sequential accent color, hover/keyboard
  tooltips.
- **Sites by time** — the full ranked list behind the popup's Today view.
- **Share of time** — a single stacked bar (top 7 sites + "Other"), colored
  from a Nord-derived categorical palette. Colors are assigned per-domain by
  a stable hash, not by rank, so a given site keeps its color across filter
  changes; every segment is also directly labeled or covered by the legend
  below it, so nothing depends on color alone.
- **Private session** — always shows the current session's incognito time,
  independent of the date filter (there's no incognito history to filter by).

## Blocking

Managed from the **Website blocking** card in the options page:

- **Adding** a site (e.g. `youtube.com`) blocks it immediately — that domain
  and its subdomains, main frame and iframes. Visiting it redirects to a
  local blocked page that's purely informational — no unlock control lives
  there, on purpose, so hitting a block never puts an "undo" one click away
  in the moment.
- **Removing** a site (from the options page), or turning the
  **Blocking enabled** toggle off, first shows a short math problem (e.g.
  `23 × 34 + 41`, `78 + 52 − 26`) — hard enough that you can't answer it
  reflexively, easy enough not to need a calculator. A wrong answer swaps
  in a new problem rather than letting you retry the same one. This is
  friction against an impulsive click, not a security boundary — anyone
  with the "Allow in Incognito" toggle already has full access to
  `chrome://extensions`.
- Blocking is enforced with `declarativeNetRequest` redirect rules, which
  the browser evaluates natively before a blocked page ever loads. No
  content script is injected into any page you visit for this.

## Font

Install **Martian Mono Nerd Font** (via [Nerd Fonts](https://www.nerdfonts.com/))
system-wide for the intended look. The UI itself only relies on plain
monospace metrics (all icons are inline SVG, not glyphs), so it stays fully
legible without the font installed too.

## Project layout

```
manifest.json          MV3 manifest (split incognito, tabs/idle/alarms/storage/DNR permissions)
background.js           Event-driven tracking service worker + DNR rule resync on install
popup.html/css/js       Today's Normal/Private view + links to Dashboard/Options
options.html/css/js     Idle-pause toggle, blocking list, reset, incognito-enable instructions
dashboard.html/css/js   Full history view: filters, KPIs, trend + share charts
blocked.html/css/js     Informational landing page shown for a blocked navigation
common/
  util.js                Domain/date/duration/escaping/domain-input-normalizing helpers
  storage.js              Normal (local) vs private (session) stats storage + range aggregation
  blocklist.js             Block list storage + declarativeNetRequest dynamic rule sync
  challenge.js              Arithmetic-problem generator + reusable unlock modal
  palette.js               Validated Nord categorical chart palette + per-domain color hashing
  charts.js                 SVG/HTML chart primitives (ranked bars, trend chart, share bar) + tooltips
  icons.js                  Inline SVG icon set
  nord.css                  Shared Nord palette + Martian Mono font stack + shared components
  page.css                  Shared full-page chrome for options.html/dashboard.html
  charts.css                Chart-specific styling
  challenge.css              Unlock-modal styling
icons/                   Generated toolbar/store icons
```
