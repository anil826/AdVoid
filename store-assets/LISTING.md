# AdVoid — Chrome Web Store Listing (submission-ready)

> All content below reflects what the extension **actually does** (verified against
> the source). Use this — not the older concept slides in `concept/` — for the
> store submission.

---

## Product name (store title)
**AdVoid — Ad Blocker for YouTube**

_Note: "for YouTube" is descriptive (nominative) use, which is safer under Chrome
Web Store trademark policy than "YouTube Ad Blocker". Do not use YouTube's logo,
wordmark styling, or colors in the icon or screenshots._

## Category
Productivity

## Language
English (United States)

## Short description (≤132 characters)
> Automatically block, skip, and hide YouTube ads. Lightweight, private, and open source — no data collection.

## Detailed description
```text
AdVoid sends YouTube ads into the void. It blocks, skips, and hides ads
automatically so you can just watch — with no accounts, no tracking, and no
data collection.

➤ WHAT IT DOES
• Network-level blocking — stops requests to major ad servers (DoubleClick,
  Google ad services) and YouTube's own ad endpoints (/pagead, /ptracking,
  ad-stats) using Chrome's built-in declarativeNetRequest engine.
• Automatic skip — clicks the "Skip" button the instant it appears.
• Un-skippable ads — muted and fast-forwarded at 16x, then your volume and
  playback speed are restored exactly as they were.
• On-page ad hiding — removes banner ads, in-feed ads, overlays, promoted
  videos, and mastheads, injected before the page paints.
• Live counter — a popup shows how many ads AdVoid has blocked, with a simple
  on/off toggle.

➤ PRIVATE BY DESIGN
• No data collection. No analytics. No accounts.
• No remote code — everything ships inside the extension and is auditable.
• Your on/off preference and the ads-blocked count are stored only on your
  device.

➤ LIGHTWEIGHT
• Uses an efficient MutationObserver (gated behind requestAnimationFrame)
  instead of aggressive polling, and handles YouTube's single-page navigation
  cleanly to stay fast.

➤ OPEN SOURCE
• Full source: https://github.com/anil826/AdVoid

Install AdVoid and enjoy YouTube without the interruptions.
```

## Screenshots (1280×800)
Use the honest, correctly-sized set in `screenshots/`:
1. `screenshots/screenshot1.png` — brand / hero
2. `screenshots/screenshot2.png` — network-level blocking
3. `screenshots/screenshot3.png` — auto-skip & fast-forward
4. `screenshots/screenshot4.png` — on-page ad hiding
5. `screenshots/screenshot5.png` — private & lightweight

Store icon: `../icons/icon128.png` (128×128).

## Permission justifications (paste into the dashboard)
- **declarativeNetRequest**: Blocks network requests to advertising domains and
  YouTube ad endpoints via a static bundled ruleset. Request contents are not read.
- **storage**: Saves the user's on/off preference and a local ads-blocked counter.
  Nothing is sent off the device.
- **Host access to youtube.com** (content script): Detects and skips video ads and
  hides on-page ad elements while the user browses YouTube.

## Privacy / Data safety answers
- Does this item collect user data? **No.**
- Sold to third parties? **No.** Used for unrelated purposes? **No.**
  Used for creditworthiness/lending? **No.**
- Privacy policy URL: host `PRIVACY.md` (e.g., via GitHub:
  https://github.com/anil826/AdVoid/blob/main/PRIVACY.md).
- Single purpose: "AdVoid's single purpose is to block, skip, and hide
  advertisements on YouTube."

## Pre-submission checklist
- [x] Manifest V3, version 1.0.2
- [x] No unused permissions (`scripting` and `host_permissions` removed)
- [x] Only `declarativeNetRequest` + `storage` requested
- [x] 128×128 icon present; 16/32/48/128 wired in manifest
- [x] Screenshots are 1280×800 and describe real features
- [x] Listing copy matches actual behavior (no AI/bypass/fingerprint/WASM claims)
- [x] Privacy policy prepared (`PRIVACY.md`)
- [ ] Register developer account ($5) and upload `AdVoid-v1.0.2.zip`
- [ ] Confirm store title drops standalone "YouTube Ad Blocker" naming
- [ ] Submit for review
