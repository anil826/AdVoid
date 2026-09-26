/* AdVoid: event-driven YouTube ad handling, including embedded players. */
(() => {
  "use strict";
  if (window.__adVoidLoaded) return;
  window.__adVoidLoaded = true;

  const STYLE_ID = "advoid-style";
  const PLAYER_SELECTOR = "#movie_player, .html5-video-player";
  // Never hide .video-ads: it contains the controls needed to skip video ads.
  const HIDE_SELECTORS = [
    "ytd-ad-slot-renderer", "ytd-in-feed-ad-layout-renderer",
    "ytd-promoted-sparkles-web-renderer", "ytd-promoted-video-renderer",
    "ytd-compact-promoted-video-renderer", "ytd-display-ad-renderer",
    "ytd-promoted-sparkles-text-search-renderer", "ytd-action-companion-ad-renderer",
    "ytd-companion-slot-renderer", "ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-ads']",
    "ytd-rich-item-renderer:has(ytd-ad-slot-renderer)",
    "ytm-ad-slot-renderer", "ytm-promoted-sparkles-web-renderer",
    "ytm-companion-ad-renderer", "#player-ads", "#masthead-ad",
    ".ytp-ad-overlay-container", ".ytp-ad-overlay-slot", ".ytp-ad-image-overlay"
  ];
  const SKIP_SELECTOR = [
    ".ytp-ad-skip-button-modern", ".ytp-ad-skip-button",
    ".ytp-skip-ad-button", ".ytp-ad-skip-button-slot button"
  ].join(",");
  const MEDIA_EVENTS = ["loadedmetadata", "durationchange", "timeupdate", "playing", "emptied"];
  let enabled = false;
  let player = null;
  let video = null;
  let session = null;
  let contentSource = "";
  let queued = false;
  let retryTimer = null;
  let lastButton = null;
  let lastClick = -Infinity;
  let lastSeek = -Infinity;

  function injectStyle() {
    if (!enabled || !document.documentElement || document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = HIDE_SELECTORS.join(",\n") + " { display: none !important; }";
    (document.head || document.documentElement).appendChild(style);
  }

  function inAd() {
    return !!player && (player.classList.contains("ad-showing") ||
      player.classList.contains("ad-interrupting"));
  }

  function clearRetry() {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
  }

  // One retry timer only during an ad. Unlike rAF, this also works in hidden
  // tabs (subject to Chrome's normal background timer throttling).
  function retryAd() {
    if (retryTimer !== null) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      scheduleScan();
    }, 100);
  }

  function restore(target) {
    if (!session || !target) return;
    try { target.playbackRate = session.rate; } catch (_) {}
    try { target.muted = session.muted; } catch (_) {}
  }

  function endSession(count) {
    clearRetry();
    if (!session) return;
    restore(session.video);
    if (video !== session.video) restore(video);
    const handled = session.handled;
    session = null;
    lastButton = null;
    lastClick = lastSeek = -Infinity;
    if (count && handled) {
      try {
        chrome.runtime.sendMessage({ type: "AD_SKIPPED" }, () => void chrome.runtime.lastError);
      } catch (_) {}
    }
  }

  function visible(button) {
    if (button.disabled || button.getAttribute("aria-disabled") === "true" ||
        !button.getClientRects().length) return false;
    const style = getComputedStyle(button);
    return style.visibility !== "hidden" && style.visibility !== "collapse" && style.display !== "none";
  }

  function clickSkip() {
    for (const button of player.querySelectorAll(SKIP_SELECTOR)) {
      if (!visible(button)) continue;
      const now = performance.now();
      if (button === lastButton && now - lastClick < 250) continue;
      lastButton = button;
      lastClick = now;
      button.click();
      return true;
    }
    return false;
  }

  function handleAd() {
    if (!enabled || !player) return;
    if (!inAd()) {
      endSession(true);
      if (video && video.readyState >= 1) contentSource = video.currentSrc;
      return;
    }
    retryAd();
    if (video && !session) {
      session = { video, rate: video.playbackRate, muted: video.muted, handled: false };
    }
    if (clickSkip()) {
      if (session) session.handled = true;
      return;
    }
    if (!video || !session) return;

    // ad-interrupting can precede the media swap. A short duration alone does
    // not prove this is an ad: ordinary YouTube videos can be short too.
    const source = video.currentSrc;
    const duration = video.duration;
    const confirmedClip = player.classList.contains("ad-showing") &&
      source && source !== contentSource && video.readyState >= 1 &&
      Number.isFinite(duration) && duration > 0 && duration <= 300;
    if (!confirmedClip) {
      // Restore immediately if content returns before the ad class clears.
      restore(video);
      return;
    }
    try { video.muted = true; } catch (_) {}
    try { video.playbackRate = 16; } catch (_) {}
    session.handled = true;
    try {
      const now = performance.now();
      if (now - lastSeek >= 250 && video.currentTime < duration - 0.1) {
        lastSeek = now;
        video.currentTime = Math.max(0, duration - 0.05);
      }
    } catch (_) { /* Some streams reject seeking; accelerated playback remains. */ }
  }

  function mediaChanged() {
    if (session && (!inAd() || (video && video.currentSrc === contentSource))) restore(video);
    scheduleScan();
  }

  const playerObserver = new MutationObserver(scheduleScan);
  function bindPlayer() {
    const nextPlayer = player && player.isConnected ? player : document.querySelector(PLAYER_SELECTOR);
    if (nextPlayer !== player) {
      endSession(false);
      playerObserver.disconnect();
      player = nextPlayer;
      contentSource = "";
      if (player) playerObserver.observe(player, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ["class", "style", "hidden", "disabled", "aria-disabled", "src"]
      });
    }
    const nextVideo = player && (player.querySelector("video.html5-main-video") || player.querySelector("video"));
    if (nextVideo !== video) {
      if (video) MEDIA_EVENTS.forEach((event) => video.removeEventListener(event, mediaChanged));
      // Restore the detached element too; YouTube can reuse it later.
      restore(video);
      video = nextVideo;
      if (video) {
        MEDIA_EVENTS.forEach((event) => video.addEventListener(event, mediaChanged, { passive: true }));
        if (session) restore(video);
      }
    }
  }

  function scan() {
    if (!enabled) return;
    injectStyle();
    bindPlayer();
    handleAd();
  }

  function scheduleScan() {
    if (!enabled || queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      scan();
    });
  }

  // Global observer only discovers/replaces players and restores our style.
  // Attribute churn in comments, chat and recommendations is ignored.
  const discoveryObserver = new MutationObserver(() => {
    if (!player || !player.isConnected || !document.getElementById(STYLE_ID)) scheduleScan();
  });

  function applyEnabled(on) {
    enabled = on !== false;
    if (enabled) {
      discoveryObserver.observe(document, { childList: true, subtree: true });
      scan();
    } else {
      discoveryObserver.disconnect();
      playerObserver.disconnect();
      endSession(false);
      if (video) MEDIA_EVENTS.forEach((event) => video.removeEventListener(event, mediaChanged));
      player = video = null;
      contentSource = "";
      document.getElementById(STYLE_ID)?.remove();
    }
  }

  ["yt-navigate-finish", "yt-page-data-updated", "spfdone", "DOMContentLoaded", "pageshow"]
    .forEach((event) => document.addEventListener(event, scheduleScan, { passive: true }));
  document.addEventListener("visibilitychange", scheduleScan, { passive: true });

  // Wait for the preference before modifying anything. Ignore stale initial
  // reads after a toggle; disabled stays disabled during SPA navigation.
  let preferenceChanged = false;
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.enabled) {
        preferenceChanged = true;
        applyEnabled(changes.enabled.newValue);
      }
    });
    chrome.storage.local.get({ enabled: true }, (res) => {
      if (!preferenceChanged) applyEnabled(chrome.runtime.lastError ? true : res.enabled);
    });
  } catch (_) { applyEnabled(true); }
})();
