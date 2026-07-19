/* AdVoid — popup controller */
(() => {
  "use strict";

  const toggle = document.getElementById("toggle");
  const statusEl = document.getElementById("status");
  const statusText = document.getElementById("statusText");
  const countEl = document.getElementById("count");
  const card = document.getElementById("card");

  let displayed = 0; // currently shown counter value (for animation)

  function renderState(enabled) {
    toggle.checked = !!enabled;
    statusEl.classList.toggle("on", !!enabled);
    statusEl.classList.toggle("off", !enabled);
    statusText.textContent = enabled ? "Active" : "Disabled";
    card.classList.toggle("disabled", !enabled);
  }

  // Animate the counter from `displayed` up/down to `target`.
  function animateCount(target) {
    target = Math.max(0, target | 0);
    if (target === displayed) { countEl.textContent = String(target); return; }
    const start = displayed;
    const delta = target - start;
    const duration = 500;
    const t0 = performance.now();

    function step(now) {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const val = Math.round(start + delta * eased);
      countEl.textContent = String(val);
      if (p < 1) requestAnimationFrame(step);
      else displayed = target;
    }
    requestAnimationFrame(step);
  }

  // Load initial state.
  function load() {
    try {
      chrome.storage.local.get({ enabled: true, adsBlocked: 0 }, (res) => {
        if (chrome.runtime.lastError) { renderState(true); return; }
        renderState(res.enabled !== false);
        animateCount(res.adsBlocked || 0);
      });
    } catch (_) {
      renderState(true);
    }
  }

  // Toggle handler — persist and notify background.
  toggle.addEventListener("change", () => {
    const enabled = toggle.checked;
    renderState(enabled);
    try {
      chrome.runtime.sendMessage({ type: "SET_ENABLED", enabled }, () => void chrome.runtime.lastError);
      chrome.storage.local.set({ enabled });
    } catch (_) {}
  });

  // Live updates when storage changes (stats ticking up, or toggled elsewhere).
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.adsBlocked) animateCount(changes.adsBlocked.newValue || 0);
      if (changes.enabled) renderState(changes.enabled.newValue !== false);
    });
  } catch (_) {}

  load();
})();
