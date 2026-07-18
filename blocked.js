import { icons } from "./common/icons.js";

const el = (id) => document.getElementById(id);

const site = new URLSearchParams(location.search).get("site") || "this site";

el("blockedIcon").innerHTML = icons.block;
el("blockedDomain").textContent = site;
