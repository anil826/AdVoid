/*
 * AdVoid — service worker
 * Tracks ad-skip stats and keeps the DNR ruleset in sync with the toggle.
 */

const RULESET_ID = "advoid_rules";

// Initialize defaults on install/update.
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ enabled: true, adsBlocked: 0 }, (res) => {
    chrome.storage.local.set({
      enabled: res.enabled !== false,
      adsBlocked: res.adsBlocked || 0
    });
    applyRuleset(res.enabled !== false);
  });
});

// Ensure ruleset matches stored state whenever the worker spins up.
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get({ enabled: true }, (res) => applyRuleset(res.enabled !== false));
});

// Toggle the declarative ruleset on/off with the extension state.
function applyRuleset(enabled) {
  try {
    chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enabled ? [RULESET_ID] : [],
      disableRulesetIds: enabled ? [] : [RULESET_ID]
    });
  } catch (_) { /* API unavailable — content script still handles DOM ads */ }
}

// Count ad skips reported by the content script.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "AD_SKIPPED") {
    chrome.storage.local.get({ adsBlocked: 0 }, (res) => {
      const next = (res.adsBlocked || 0) + 1;
      chrome.storage.local.set({ adsBlocked: next });
    });
    return; // fire-and-forget
  }

  if (msg.type === "SET_ENABLED") {
    const enabled = !!msg.enabled;
    chrome.storage.local.set({ enabled }, () => {
      applyRuleset(enabled);
      sendResponse({ ok: true, enabled });
    });
    return true; // async response
  }

  if (msg.type === "GET_STATE") {
    chrome.storage.local.get({ enabled: true, adsBlocked: 0 }, (res) => {
      sendResponse(res);
    });
    return true; // async response
  }
});

// Keep ruleset in sync if the toggle is changed elsewhere (e.g. popup storage write).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled) {
    applyRuleset(changes.enabled.newValue !== false);
  }
});
