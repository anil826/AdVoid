# Privacy Policy — AdVoid

_Last updated: 2026-09-26_

AdVoid ("the extension") is designed to protect your attention **and** your privacy.

## What we collect

**Nothing.** AdVoid does not collect, transmit, sell, or share any personal or
usage data. There are no accounts, no analytics, no tracking pixels, and no
remote servers.

## Data stored on your device

AdVoid uses Chrome's local storage (`chrome.storage.local`) to save two things,
**only on your own computer**:

1. **Your on/off preference** — whether ad blocking is currently enabled.
2. **The ads-blocked counter** — a running count shown in the popup.

This data never leaves your device. Uninstalling the extension removes it.

## Permissions and why they are used

- **declarativeNetRequest** — to block network requests to advertising domains
  and YouTube ad endpoints using a static, bundled ruleset. It does not read the
  content of your requests.
- **storage** — to save the on/off toggle and the local ads-blocked counter
  described above.
- **Access to youtube.com and youtube-nocookie.com** (via the content script) —
  to detect and skip video ads and hide on-page ad elements on YouTube and in
  matching embedded YouTube frames.

The extension also processes known YouTube player-response fields in page memory
to remove ad placements before playback. It does not save, log, or transmit
player responses, video URLs, captions, or account information. This bundled
page-world code has no direct access to extension APIs; the control channel
carries only the on/off preference.

## Remote code

AdVoid contains **no remote code**. All logic ships inside the extension package
and is fully auditable in the source repository.

## Changes to this policy

If this policy changes, the updated version will be published in the project
repository with a new "Last updated" date.

## Contact

Questions? Open an issue at https://github.com/anil826/AdVoid
