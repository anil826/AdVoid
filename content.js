/*
 * AdVoid — content script
 * Runs at document_start on youtube.com.
 * Handles: video ad skipping, overlay/banner hiding, SPA re-init.
 */
(() => {
  "use strict";

  // Guard against double injection on the same document.
  if (window.__adVoidLoaded) return;
  window.__adVoidLoaded = true;

  const STYLE_ID = "advoid-style";
  let ENABLED = true;

  // ---------------------------------------------------------------------------
  // 1. Static CSS injection (overlay / banner / feed ads) — inject ASAP.
  // ---------------------------------------------------------------------------
  const HIDE_SELECTORS = [
    "ytd-ad-slot-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "ytd-banner-promo-renderer",
    "ytd-statement-banner-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-promoted-video-renderer",
    "ytd-compact-promoted-video-renderer",
    "ytd-display-ad-renderer",
    "ytd-rich-item-renderer:has(ytd-ad-slot-renderer)",
    "#player-ads",
    "#masthead-ad",
    ".video-ads",
    ".ytp-ad-overlay-container",
    ".ytp-ad-overlay-slot",
    ".ytp-ad-progress-list",
    ".ytp-suggested-action",
    "ytmusic-mealbar-promo-renderer"
  ];

  function injectStyle() {
    try {
      if (document.getElementById(STYLE_ID)) return;
      const css = HIDE_SELECTORS.join(",\n") + " { display: none !important; }";
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    } catch (_) { /* head not ready yet — retried by observer */ }
  }
  injectStyle();

  function setStyleEnabled(on) {
    try {
      const el = document.getElementById(STYLE_ID);
      if (on) {
        if (!el) injectStyle();
      } else if (el) {
        el.remove();
      }
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Stats messaging (debounced so a single ad = a single count).
  // ---------------------------------------------------------------------------
  let lastCountedAt = 0;
  function reportAdSkipped() {
    const now = Date.now();
    if (now - lastCountedAt < 1500) return; // collapse rapid re-detections
    lastCountedAt = now;
    try {
      chrome.runtime.sendMessage({ type: "AD_SKIPPED" }, () => void chrome.runtime.lastError);
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // 2. Video ad handling.
  // ---------------------------------------------------------------------------
  // Classes YouTube puts on the player ONLY while an ad is actually playing,
  // and removes the instant real content resumes. This is the reliable signal.
  const AD_STATE_CLASSES = ["ad-showing", "ad-interrupting"];
  const SKIP_BUTTON_SELECTORS = [
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button",
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button-slot button",
    "button.ytp-ad-skip-button-modern"
  ];

  // Saved player state so we can restore after the ad.
  let saved = null; // { rate, muted }

  function getVideo() {
    try {
      return document.querySelector("video.html5-main-video") ||
             document.querySelector("#movie_player video") ||
             document.querySelector("video");
    } catch (_) { return null; }
  }

  function getPlayer() {
    try {
      const p = document.getElementById("movie_player") ||
                document.querySelector(".html5-video-player");
      return (p && typeof p.mute === "function") ? p : null;
    } catch (_) { return null; }
  }

  // Read mute state through the player (keeps UI + element in sync).
  function isMuted(video) {
    try {
      const p = getPlayer();
      if (p && typeof p.isMuted === "function") return !!p.isMuted();
    } catch (_) {}
    return !!(video && video.muted);
  }

  // Mute/unmute via the player API when possible, falling back to the element.
  // Directly toggling video.muted alone desyncs YouTube's player state, which
  // leaves the real video silent until the user nudges the volume.
  function setMuted(video, mute) {
    try {
      const p = getPlayer();
      if (p) {
        if (mute && typeof p.mute === "function") p.mute();
        else if (!mute && typeof p.unMute === "function") p.unMute();
      }
    } catch (_) {}
    try { if (video) video.muted = !!mute; } catch (_) {}
  }

  function adIsShowing() {
    try {
      const player = document.getElementById("movie_player") ||
                     document.querySelector(".html5-video-player");
      if (!player || !player.classList) return false;
      // Detect ONLY by the live ad-state class. Do NOT use the .ytp-ad-*
      // container elements — those linger in the DOM after the ad ends, which
      // would keep the real video muted/detected as an ad forever.
      return AD_STATE_CLASSES.some((c) => player.classList.contains(c));
    } catch (_) { return false; }
  }

  function clickSkip() {
    let clicked = false;
    for (const sel of SKIP_BUTTON_SELECTORS) {
      try {
        const btn = document.querySelector(sel);
        if (btn && btn.offsetParent !== null) {
          btn.click();
          clicked = true;
          break;
        }
      } catch (_) {}
    }
    return clicked;
  }

  function handleAd() {
    if (!ENABLED) return;
    const video = getVideo();
    if (!video) return;

    if (!adIsShowing()) {
      // Ad finished — restore state.
      if (saved) {
        try { video.playbackRate = saved.rate; } catch (_) {}
        if (saved.muted) {
          // User had it muted before the ad; leave it muted and we're done.
          saved = null;
        } else {
          // Restore sound. Re-assert across scans until it actually takes
          // effect (the media element can be swapped on resume), then stop so
          // we never fight a later manual mute by the user.
          setMuted(video, false);
          if (!video.muted) saved = null;
        }
      }
      return;
    }

    // Ad is showing.
    if (!saved) {
      saved = { rate: video.playbackRate || 1, muted: isMuted(video) };
      reportAdSkipped();
    }

    // Try the reliable path first: a skip button. This never touches playback.
    if (clickSkip()) return;

    // Un-skippable ad: mute it (via the player API) so the user hears nothing.
    if (!isMuted(video)) setMuted(video, true);

    // Fast-forward ONLY when we are confident this is a short ad clip, so a
    // mis-timed detection during a source swap can never speed up or seek the
    // real video (which would show as an endless spinner / instant-ended video).
    try {
      const dur = video.duration;
      const looksLikeAd = Number.isFinite(dur) && dur > 0 && dur <= 300; // ads are short
      if (looksLikeAd) {
        if (video.playbackRate !== 16) video.playbackRate = 16;
        if (video.currentTime < dur - 0.15) {
          // Advance toward the end. If YouTube rejects the seek, the 16x rate
          // still clears the ad in a moment without stalling the player.
          video.currentTime = dur - 0.1;
        }
      }
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // 3. Scheduling — MutationObserver + rAF gate (no aggressive setInterval).
  // ---------------------------------------------------------------------------
  let scanQueued = false;
  function scheduleScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      handleAd();
    });
  }

  let observer = null;
  function startObserver() {
    try {
      if (observer) return;
      observer = new MutationObserver(() => {
        injectStyle();   // re-assert style if YouTube stripped it
        scheduleScan();
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"]
      });
    } catch (_) {}
  }
  function stopObserver() {
    try {
      if (observer) { observer.disconnect(); observer = null; }
    } catch (_) {}
  }

  // Also bind to the video's own timeupdate — cheap and fires during ads.
  function bindVideoEvents() {
    const video = getVideo();
    if (!video || video.__adVoidBound) return;
    try {
      video.__adVoidBound = true;
      video.addEventListener("timeupdate", scheduleScan, { passive: true });
      video.addEventListener("loadedmetadata", scheduleScan, { passive: true });
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // 4. SPA navigation handling.
  // ---------------------------------------------------------------------------
  function reinit() {
    injectStyle();
    bindVideoEvents();
    scheduleScan();
  }
  ["yt-navigate-finish", "yt-page-data-updated", "spfdone"].forEach((evt) => {
    try { document.addEventListener(evt, reinit, { passive: true }); } catch (_) {}
  });

  // ---------------------------------------------------------------------------
  // Enable/disable wiring from popup/background.
  // ---------------------------------------------------------------------------
  function applyEnabled(on) {
    ENABLED = !!on;
    setStyleEnabled(ENABLED);
    if (ENABLED) { startObserver(); reinit(); }
    else { stopObserver(); }
  }

  try {
    chrome.storage.local.get({ enabled: true }, (res) => {
      if (chrome.runtime.lastError) { applyEnabled(true); return; }
      applyEnabled(res.enabled);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.enabled) applyEnabled(changes.enabled.newValue);
    });
  } catch (_) {
    applyEnabled(true);
  }

  // Kick off once the DOM is minimally ready.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", reinit, { once: true });
  }
  startObserver();
  reinit();
})();
