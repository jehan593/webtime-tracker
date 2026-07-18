// A deliberately-not-instant arithmetic check, used as friction in front of
// anything that undoes a block (removing a site, turning blocking off). The
// point isn't security - it's making the undo take real mental effort
// instead of a single reflexive click, the same trick self-control tools
// like StayFocusd/Cold Turkey use. A wrong answer swaps in a fresh problem
// rather than letting the reader retry the same one.

import { escapeHtml } from "./util.js";

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const TEMPLATES = [
  () => {
    const a = randInt(12, 29);
    const b = randInt(12, 19);
    const c = randInt(10, 89);
    return { question: `${a} × ${b} + ${c}`, answer: a * b + c };
  },
  () => {
    const a = randInt(45, 98);
    const b = randInt(23, 67);
    const c = randInt(11, 39);
    return { question: `${a} + ${b} − ${c}`, answer: a + b - c };
  },
  () => {
    const a = randInt(12, 28);
    const b = randInt(12, 28);
    return { question: `${a} × ${b}`, answer: a * b };
  },
];

export function generateChallenge() {
  return TEMPLATES[randInt(0, TEMPLATES.length - 1)]();
}

// Resolves true if the user solves a problem, false if they cancel.
export function showChallenge({ title = "Quick check", message = "Solve this to continue:" } = {}) {
  return new Promise((resolve) => {
    let current = generateChallenge();
    let settled = false;

    const overlay = document.createElement("div");
    overlay.className = "challenge-overlay";
    const card = document.createElement("div");
    card.className = "challenge-card";
    overlay.appendChild(card);

    function finish(result) {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeydown);
      overlay.remove();
      resolve(result);
    }

    function onKeydown(e) {
      if (e.key === "Escape") finish(false);
    }

    function render(showError) {
      card.innerHTML = `
        <h3>${escapeHtml(title)}</h3>
        <p class="challenge-message">${escapeHtml(message)}</p>
        <p class="challenge-question">${current.question} = ?</p>
        <input type="text" inputmode="numeric" autocomplete="off" class="challenge-input" id="challengeInput" />
        <p class="challenge-error" ${showError ? "" : "hidden"}>Not quite — here's a new one.</p>
        <div class="challenge-actions">
          <button class="link-btn" id="challengeCancel" type="button">Cancel</button>
          <button class="primary" id="challengeSubmit" type="button">Unlock</button>
        </div>`;
      const input = card.querySelector("#challengeInput");
      input.focus();
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
      card.querySelector("#challengeSubmit").addEventListener("click", submit);
      card.querySelector("#challengeCancel").addEventListener("click", () => finish(false));
    }

    function submit() {
      const input = card.querySelector("#challengeInput");
      const value = Number(input.value.trim());
      const correct = input.value.trim() !== "" && Number.isFinite(value) && value === current.answer;
      if (correct) {
        finish(true);
      } else {
        current = generateChallenge();
        render(true);
      }
    }

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) finish(false);
    });
    document.addEventListener("keydown", onKeydown);

    document.body.appendChild(overlay);
    render(false);
  });
}
