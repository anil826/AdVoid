/*
 * AdVoid's YouTube response filter. Runs in MAIN at document_start so the
 * player receives filtered data before constructing client-side ad breaks.
 * Original implementation; no remote code or arbitrary scriptlet execution.
 */
(() => {
  "use strict";
  const STATE_EVENT = "advoid:response-filter-state";
  const READY_EVENT = "advoid:response-filter-ready";
  const parse = JSON.parse;
  const stringify = JSON.stringify;
  const wrapped = new WeakSet();
  const xhrCache = new WeakMap();
  // Fail open until the isolated content script supplies the stored preference.
  let enabled = false;

  function isPlayerURL(input) {
    try {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, location.href);
      return /(^|\.)youtube(?:-nocookie)?\.com$/.test(url.hostname) &&
        /^\/youtubei\/v1\/(?:player|get_watch|next)\/?$/.test(url.pathname);
    } catch (_) { return false; }
  }

  // Only known player envelopes; never recursively walk comments, captions,
  // streaming formats, error messages, or arbitrary page objects.
  function prune(value, depth = 0) {
    if (!enabled || !value || typeof value !== "object" || depth > 3) return 0;
    let removed = 0;
    if (Array.isArray(value)) {
      for (const item of value) removed += prune(item, depth + 1);
      return removed;
    }
    for (const key of ["adPlacements", "adSlots"]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && descriptor.configurable && "value" in descriptor && Reflect.deleteProperty(value, key)) removed++;
    }
    const player = Object.getOwnPropertyDescriptor(value, "playerResponse");
    if (player && "value" in player) removed += prune(player.value, depth + 1);
    return removed;
  }

  function cleanText(text) {
    if (!enabled || typeof text !== "string" ||
        (!text.includes('"adPlacements"') && !text.includes('"adSlots"'))) return text;
    try {
      const value = parse(text);
      return prune(value) ? stringify(value) : text;
    } catch (_) { return text; } // malformed/streaming responses pass through
  }

  // Initial HTML embeds this object directly rather than fetching it. Preserve
  // descriptor semantics where possible; don't replace someone else's accessor.
  function hookInitialResponse() {
    const name = "ytInitialPlayerResponse";
    const descriptor = Object.getOwnPropertyDescriptor(window, name);
    if (descriptor && (!descriptor.configurable || descriptor.get || descriptor.set || !descriptor.writable)) return;
    let value = descriptor?.value;
    Object.defineProperty(window, name, {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      get() { prune(value); return value; },
      set(next) { prune(next); value = next; }
    });
  }

  // Decorate consumption methods instead of eagerly buffering/reconstructing
  // Responses. Identity, URL, status, headers, aborts, and bodyUsed stay native.
  // Direct ReadableStream consumers are deliberately left untouched.
  function wrapResponse(response) {
    if (!response || wrapped.has(response)) return response;
    wrapped.add(response);
    try {
      const originalJSON = response.json;
      const originalText = response.text;
      const originalClone = response.clone;
      Object.defineProperties(response, {
        json: { configurable: true, writable: true, value: function (...args) {
          return Reflect.apply(originalJSON, this, args).then(value => {
            // Borrowed methods must not filter an unrelated response.
            if (this === response) prune(value);
            return value;
          });
        } },
        text: { configurable: true, writable: true, value: function (...args) {
          return Reflect.apply(originalText, this, args).then(value => this === response ? cleanText(value) : value);
        } },
        clone: { configurable: true, writable: true, value: function (...args) {
          const clone = Reflect.apply(originalClone, this, args);
          return this === response ? wrapResponse(clone) : clone;
        } }
      });
    } catch (_) { /* A frozen response must remain usable. */ }
    return response;
  }

  try {
    hookInitialResponse();
  } catch (_) { /* Other blockers may own the initial-data property. */ }

  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch;
    window.fetch = new Proxy(originalFetch, {
      apply(target, receiver, args) {
        const result = Reflect.apply(target, receiver, args);
        if (!enabled || !isPlayerURL(args[0])) return result;
        return result.then(response => {
          // Avoid filtering a response redirected away from the player API.
          if (response.url && !isPlayerURL(response.url)) return response;
          return wrapResponse(response);
        });
      }
    });
  }

  // Some YouTube clients use XHR instead of fetch. Patch getters rather than
  // dispatching synthetic events or modifying requests. Partial responses and
  // non-JSON bodies keep their native semantics.
  if (typeof XMLHttpRequest !== "undefined") {
    for (const name of ["response", "responseText"]) {
      const descriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, name);
      if (!descriptor?.get || !descriptor.configurable) continue;
      try {
        Object.defineProperty(XMLHttpRequest.prototype, name, {
          ...descriptor,
          get() {
            const value = Reflect.apply(descriptor.get, this, []);
            if (!enabled || this.readyState !== 4 || !isPlayerURL(this.responseURL)) return value;
            if (name === "response" && this.responseType === "json") {
              prune(value);
              return value;
            }
            if (this.responseType && this.responseType !== "text") return value;
            const cached = xhrCache.get(this);
            if (cached?.raw === value) return cached.clean;
            const clean = cleanText(value);
            xhrCache.set(this, { raw: value, clean });
            return clean;
          }
        });
      } catch (_) { /* Preserve playback if another script owns the getter. */ }
    }
  }

  // This channel carries only a boolean preference into the unprivileged page
  // world. It cannot request extension API calls or write extension storage.
  document.addEventListener(STATE_EVENT, event => {
    if (typeof event.detail !== "boolean") return;
    enabled = event.detail;
    if (enabled) {
      try { prune(window.ytInitialPlayerResponse); } catch (_) {}
    }
  });
  document.dispatchEvent(new Event(READY_EVENT));
})();
