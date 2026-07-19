# 🛡️ AdVoid — YouTube Ad Blocker

> Send YouTube ads into the void.

A lightweight Chrome extension (Manifest V3) that blocks, skips, and hides YouTube ads using a combination of **declarative network filtering** and **real-time DOM interaction** — no external libraries, no remote code, no data collection.

## Features

- 🚫 **Network-level ad blocking** — blocks requests to major ad-serving domains (`doubleclick.net`, `googlesyndication.com`, `googleadservices.com`, `googletagservices.com`) and YouTube's own ad endpoints (`/pagead/`, `/ptracking`, `/api/stats/ads`) using Chrome's `declarativeNetRequest` API.
- ⏭️ **Automatic ad skipping** — detects when a video ad is playing and clicks the "Skip" button the moment it appears.
- 🔇 **Un-skippable ad handling** — mutes un-skippable ads and fast-forwards them at 16× so you never sit through one.
- 🙈 **On-page ad hiding** — injects CSS at `document_start` to hide banner ads, in-feed ads, overlay ads, promoted videos, and masthead ads before they render.
- 🔊 **State restoration** — remembers your playback rate and mute state before an ad and restores them exactly once the ad ends (it never unmutes a video you muted yourself).
- 📊 **Ads-blocked counter** — a popup shows a live count of ads skipped, with an on/off toggle.
- ⚡ **Performance-friendly** — uses a `MutationObserver` gated behind `requestAnimationFrame` instead of aggressive polling, and handles YouTube's SPA navigation (`yt-navigate-finish`) without re-injecting.

## How It Works

The extension operates in three coordinated layers:

| Layer | File | Role |
|---|---|---|
| Network filtering | `rules.json` | Static `declarativeNetRequest` rules that block ad/tracking requests before they leave the browser. |
| Page interaction | `content.js` | Runs on `youtube.com` at `document_start`. Hides ad elements with injected CSS, detects the player's `ad-showing` state, clicks skip buttons, and mutes/fast-forwards un-skippable ads. |
| Coordination | `background.js` | Service worker that enables/disables the ruleset with the toggle and tracks the ads-blocked count in `chrome.storage.local`. |

The popup (`popup.html` / `popup.js` / `popup.css`) provides the on/off switch and the animated stats counter. All state lives in `chrome.storage.local`, so the toggle and counter stay in sync across the popup, background worker, and every open YouTube tab.

### Ad detection strategy

Video ads are detected **only** via the live `ad-showing` / `ad-interrupting` classes on the player element — not by the presence of `.ytp-ad-*` containers, which linger in the DOM after an ad ends and would cause false positives (e.g. leaving the real video muted). Fast-forwarding is additionally guarded by a duration check (≤ 5 minutes) so a mis-timed detection during a video source swap can never seek or speed up the actual video.

## Installation

AdVoid is not on the Chrome Web Store — install it in developer mode:

1. **Download** — clone this repository or download it as a ZIP and extract it:
   ```bash
   git clone https://github.com/anil826/AdVoid.git
   ```
2. **Open the extensions page** — go to `chrome://extensions/` (or `edge://extensions/` on Microsoft Edge).
3. **Enable Developer mode** — toggle the switch in the top-right corner.
4. **Load the extension** — click **Load unpacked** and select the project folder (the one containing `manifest.json`).
5. **Done** — open YouTube and enjoy. Click the AdVoid icon in the toolbar to see the ads-blocked counter or to toggle it off.

Works on any Chromium-based browser that supports Manifest V3 (Chrome, Edge, Brave, Opera, Vivaldi).

## Project Structure

```
AdVoid/
├── manifest.json     # Extension manifest (MV3)
├── rules.json        # declarativeNetRequest blocking rules
├── background.js     # Service worker — ruleset toggle + stats
├── content.js        # YouTube page script — skip/mute/hide ads
├── popup.html        # Popup UI
├── popup.css         # Popup styling (dark theme)
└── popup.js          # Popup logic — toggle + animated counter
```

## Permissions Explained

| Permission | Why it's needed |
|---|---|
| `declarativeNetRequest` | Apply the static ad-blocking rules in `rules.json`. |
| `storage` | Persist the on/off state and the ads-blocked counter. |
| `scripting` | Content-script support on YouTube pages. |
| Host: `*://*.youtube.com/*` | Run the ad-skipping content script on YouTube. |
| Host: `*://*.doubleclick.net/*` | Block requests to Google's primary ad server. |

**Privacy:** AdVoid collects no data, makes no network requests of its own, and runs entirely locally. The only thing it stores is a boolean (enabled/disabled) and a number (ads blocked) in your browser's local extension storage.

## Limitations

- YouTube frequently changes its ad delivery and player markup; selectors and detection logic may need occasional updates.
- Server-side ad injection (ads stitched directly into the video stream) cannot be blocked at the network level — the content script's mute + fast-forward fallback handles most of these.
- YouTube Premium features, obviously, are not included. 😄

## Contributing

Contributions are welcome! If YouTube changes its markup and something stops working, open an issue or a pull request. Good first contributions:

- Updating the CSS hide-selectors in `content.js` when new ad containers appear.
- Adding ad/tracking domains to `rules.json`.
- Improving skip-button detection.

## Disclaimer

This project is for **educational purposes** — it demonstrates Manifest V3 extension development, the `declarativeNetRequest` API, MutationObserver-based DOM monitoring, and SPA-aware content scripts. Blocking ads may be against YouTube's Terms of Service in your region. If you enjoy a creator's content, consider supporting them directly. Use at your own discretion.

## License

Released under the [MIT License](LICENSE) — free to use, modify, and distribute.
